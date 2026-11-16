// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { PeopleProvider } from '@/features/people/people-provider';
import type { AudiencePick } from '@/features/pool/audience';
import { AudienceChip, type AudiencePool } from '@/features/pool/audience-sheet';

afterEach(cleanup);

function media(wide: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: wide,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const pool = (id: string, name: string): AudiencePool => ({
  id,
  name,
  lanes: [
    { id: `${id}-a`, name: 'Days', icon: '☀' },
    { id: `${id}-b`, name: 'Trips', icon: '🏕' },
  ],
});
const FOUR = [
  pool('p1', 'Crew'),
  pool('p2', 'Family'),
  pool('p3', 'Book club'),
  pool('p4', 'Work'),
];
const NINE = [
  ...FOUR,
  pool('p5', 'Climbing'),
  pool('p6', 'Choir'),
  pool('p7', 'Neighbours'),
  pool('p8', 'School'),
  pool('p9', 'Tennis'),
];

/** A record's chip on its header, the record's rules standing in. */
function Header({ pools = FOUR, start = [] }: { pools?: AudiencePool[]; start?: AudiencePick[] }) {
  const [shared, setShared] = useState<AudiencePick[]>(start);
  return (
    <PeopleProvider me="u-me" people={{}}>
      <div data-panel>
        <AudienceChip
          shared={shared}
          pools={pools}
          invite
          outline
          preselect={(id) => pools.find((p) => p.id === id)!.lanes[0].id}
          onChange={(poolId, poolLaneId) =>
            setShared((was) =>
              poolLaneId
                ? [...was.filter((p) => p.poolId !== poolId), { poolId, poolLaneId }]
                : was.filter((p) => p.poolId !== poolId),
            )
          }
        />
        <p data-outside>elsewhere</p>
      </div>
      <output data-shared>{JSON.stringify(shared)}</output>
    </PeopleProvider>
  );
}

const shared = (c: HTMLElement) => JSON.parse(c.querySelector('[data-shared]')!.textContent!);

describe('Audience on a wide screen: a popover anchored to its trigger (H75, wide)', () => {
  it('opens under Share, right-aligned, inside the panel: no dimmed screen, no sheet', () => {
    media(true);
    const { container, getByLabelText } = render(<Header />);
    const share = getByLabelText('Share: Only me');
    fireEvent.click(share);
    const pop = container.querySelector<HTMLElement>('[data-audience-popover]')!;
    expect(pop.getAttribute('role')).toBe('dialog');
    // Hung from the control that opened it, right-aligned to it.
    expect(pop.parentElement!.contains(share)).toBe(true);
    expect(pop.parentElement!.className).toContain('relative');
    expect(pop.className).toContain('top-full');
    expect(pop.className).toContain('right-0');
    // The category picker's look: white, the soft shadow, no border, its own scroll.
    expect(pop.className).toContain('bg-white');
    expect(pop.className).toContain('shadow-lg');
    expect(pop.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(pop.className).toContain('w-80');
    expect(pop.className).toContain('overflow-y-auto');
    expect(pop.className).toMatch(/max-h-/);
    expect(document.querySelector('[data-sheet-frame], [data-sheet-scrim]')).toBeNull();
    expect(container.querySelector('[data-audience-done]')).toBeNull();
    expect(share.getAttribute('aria-expanded')).toBe('true');
  });

  it('says the helper line, then a row per diary: its face, its name alone, its switch', () => {
    media(true);
    const { container, getByLabelText } = render(<Header />);
    fireEvent.click(getByLabelText('Share: Only me'));
    const pop = container.querySelector<HTMLElement>('[data-audience-popover]')!;
    expect(pop.textContent).toContain(
      'Every note on this page follows it. With every switch off, it is yours alone.',
    );
    const rows = [...pop.querySelectorAll('[data-audience-row]')];
    expect(rows).toHaveLength(4);
    expect(rows[0].querySelector('[data-monogram]')).not.toBeNull();
    expect(rows[0].querySelector('[data-audience-name]')!.textContent).toBe('Crew');
    expect(pop.textContent).not.toContain('Shared to');
    expect(rows[0].querySelector('[role="switch"]')!.getAttribute('aria-label')).toBe(
      'Shared to Crew',
    );
    // No search with six or fewer.
    expect(pop.querySelector('[aria-label="Search"]')).toBeNull();
  });

  it('applies at once: a switch shares, its lane chips appear, another lane is one tap (H75)', () => {
    media(true);
    const { container, getByLabelText } = render(<Header />);
    fireEvent.click(getByLabelText('Share: Only me'));
    fireEvent.click(getByLabelText('Shared to Family'));
    expect(shared(container)).toEqual([{ poolId: 'p2', poolLaneId: 'p2-a' }]);
    // Still open, the chip now saying where it is.
    const pop = container.querySelector<HTMLElement>('[data-audience-popover]')!;
    expect(pop).not.toBeNull();
    fireEvent.click(pop.querySelector('[data-audience-lane="p2-b"]')!);
    expect(shared(container)).toEqual([{ poolId: 'p2', poolLaneId: 'p2-b' }]);
  });

  it('closes on Escape, and focus goes back to the control that opened it', () => {
    media(true);
    const { container, getByLabelText } = render(<Header />);
    const share = getByLabelText('Share: Only me');
    fireEvent.click(share);
    const pop = container.querySelector<HTMLElement>('[data-audience-popover]')!;
    // Focus in it from the start, so Tab reaches the first row.
    expect(document.activeElement).toBe(pop);
    let reached = 0;
    const late = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') reached += 1;
    };
    window.addEventListener('keydown', late);
    fireEvent.keyDown(pop, { key: 'Escape' });
    window.removeEventListener('keydown', late);
    expect(container.querySelector('[data-audience-popover]')).toBeNull();
    expect(document.activeElement).toBe(share);
    // The popover's Escape alone: the sheet under it never hears it.
    expect(reached).toBe(0);
  });

  it('closes on a click outside, and not on one inside', () => {
    media(true);
    const { container, getByLabelText } = render(<Header />);
    fireEvent.click(getByLabelText('Share: Only me'));
    const pop = container.querySelector<HTMLElement>('[data-audience-popover]')!;
    fireEvent.pointerDown(pop.querySelector('[data-audience-row]')!);
    expect(container.querySelector('[data-audience-popover]')).not.toBeNull();
    fireEvent.pointerDown(container.querySelector('[data-outside]')!);
    expect(container.querySelector('[data-audience-popover]')).toBeNull();
  });

  it('hangs under the N diaries chip on a shared record, the same way', () => {
    media(true);
    const { container, getByLabelText } = render(
      <Header
        start={[
          { poolId: 'p1', poolLaneId: 'p1-a' },
          { poolId: 'p3', poolLaneId: 'p3-a' },
        ]}
      />,
    );
    const chip = getByLabelText('Audience: 2 diaries');
    fireEvent.click(chip);
    const pop = container.querySelector<HTMLElement>('[data-audience-popover]')!;
    expect(pop.parentElement!.contains(chip)).toBe(true);
    expect(pop.querySelectorAll('[role="switch"][aria-checked="true"]')).toHaveLength(2);
  });

  it('heads the rows with a search past six diaries, filtering them', () => {
    media(true);
    const { container, getByLabelText } = render(<Header pools={NINE} />);
    fireEvent.click(getByLabelText('Share: Only me'));
    const pop = container.querySelector<HTMLElement>('[data-audience-popover]')!;
    const search = pop.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
    expect(search.placeholder).toBe('Search diaries');
    fireEvent.change(search, { target: { value: 'choi' } });
    expect(
      [...pop.querySelectorAll('[data-audience-row]')].map((r) =>
        r.getAttribute('data-audience-row'),
      ),
    ).toEqual(['p6']);
    fireEvent.change(search, { target: { value: 'zz' } });
    expect(pop.querySelector('[data-audience-empty]')!.textContent).toBe('No diary matches');
  });

  it('stays the bottom sheet on a phone, Shared to and Done as before', () => {
    media(false);
    const { container, getByLabelText } = render(<Header />);
    fireEvent.click(getByLabelText('Share: Only me'));
    expect(container.querySelector('[data-audience-popover]')).toBeNull();
    expect(document.querySelector('[data-audience-done]')).not.toBeNull();
    expect(document.body.textContent).toContain('Shared to Crew');
  });
});
