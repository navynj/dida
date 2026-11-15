// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DraftShare, fitNames } from '@/features/home/draft-share';
import type { AudiencePick } from '@/features/pool/audience';
import type { AudiencePool } from '@/features/pool/audience-sheet';

afterEach(cleanup);

/** jsdom has no matchMedia: a phone's width, or a wide screen's. */
function media(wide: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: wide && query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const lane = (id: string, name: string, icon: string) => ({ id, name, icon });
const POOLS: AudiencePool[] = [
  {
    id: 'p-ours',
    name: 'Our Pool',
    lanes: [lane('pl-trips', 'Trips', '🏕'), lane('pl-food', 'Food', '🍜')],
  },
  { id: 'p-crew', name: 'Crew', lanes: [lane('cr-out', 'Outings', '🚲')] },
  { id: 'p-test', name: 'test', lanes: [lane('te-a', 'A', '🅰')] },
  { id: 'p-fam', name: 'Family', lanes: [lane('fa-a', 'Home', '🏠')] },
  { id: 'p-club', name: 'Book club', lanes: [lane('bc-a', 'Books', '📚')] },
  { id: 'p-work', name: 'Work friends', lanes: [lane('wf-a', 'Lunch', '🥪')] },
];

/** The row as the draft card holds it (H80), the composer's rules standing in. */
function Row({ pools = POOLS }: { pools?: AudiencePool[] }) {
  const [shared, setShared] = useState<AudiencePick[]>([]);
  return (
    <div>
      <DraftShare
        pools={pools}
        shared={shared}
        startLane={(poolId) => pools.find((p) => p.id === poolId)?.lanes[0]?.id ?? null}
        onTurn={(poolId, poolLaneId) =>
          setShared((was) =>
            poolLaneId
              ? [...was.filter((p) => p.poolId !== poolId), { poolId, poolLaneId }]
              : was.filter((p) => p.poolId !== poolId),
          )
        }
        onPick={(poolId, poolLaneId) =>
          setShared((was) => was.map((p) => (p.poolId === poolId ? { poolId, poolLaneId } : p)))
        }
      />
      <output data-shared>{JSON.stringify(shared)}</output>
    </div>
  );
}

const row = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-share-to]')!;
const picker = () => document.querySelector<HTMLElement>('[data-share-picker]');
const chip = (id: string) => document.querySelector<HTMLElement>(`[data-share-pool="${id}"]`)!;
const shared = (c: HTMLElement): AudiencePick[] =>
  JSON.parse(c.querySelector('[data-shared]')!.textContent!);

describe.each([
  ['a phone: a bottom sheet', false],
  ['a wide screen: a popover', true],
])('Share to on the draft card, one summary row, on %s (H80, H75)', (_, wide) => {
  beforeEach(() => media(wide));
  it('is one tap target reading Share to, Not shared yet, and a chevron, with no pool chips on the card', () => {
    const { container } = render(<Row />);
    const r = row(container);
    expect(r.tagName).toBe('BUTTON');
    expect(r.getAttribute('aria-haspopup')).toBe('dialog');
    expect(r.getAttribute('aria-expanded')).toBe('false');
    expect(r.textContent).toBe('Share toNot shared yet');
    expect(r.querySelector('svg')).not.toBeNull();
    // Nothing that grows with the number of diaries is on the card itself.
    expect(container.querySelectorAll('[data-share-pool]')).toHaveLength(0);
    expect(picker()).toBeNull();
  });

  it('opens a picker: the search field always on top, then every diary as a chip, all off', () => {
    const { container } = render(<Row />);
    fireEvent.click(row(container));
    expect(row(container).getAttribute('aria-expanded')).toBe('true');
    const p = picker()!;
    // A popover on a wide screen, a bottom sheet on a phone, as the category's.
    expect(p.closest('[data-sheet-frame]') === null).toBe(wide);
    expect(p.closest('[role="dialog"]')).not.toBeNull();
    const search = p.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
    expect(search).not.toBeNull();
    expect(p.firstElementChild!.contains(search)).toBe(true);
    const chips = [...p.querySelectorAll('[data-share-pool]')];
    expect(chips.map((c) => c.getAttribute('data-share-pool'))).toEqual(POOLS.map((x) => x.id));
    expect(chips.every((c) => !c.hasAttribute('data-on'))).toBe(true);
    // Grey while off, wrapping onto rows.
    expect(chips[0].className).toContain('bg-pool-100');
    expect(chips[0].parentElement!.className).toContain('flex-wrap');
    // The search field shows even with few diaries, as the category picker's.
    cleanup();
    render(<Row pools={POOLS.slice(0, 2)} />);
    fireEvent.click(document.querySelector('[data-share-to]')!);
    expect(picker()!.querySelector('[aria-label="Search"]')).not.toBeNull();
  });

  it('filters the diaries as you type', () => {
    const { container } = render(<Row />);
    fireEvent.click(row(container));
    fireEvent.change(picker()!.querySelector('[aria-label="Search"]')!, {
      target: { value: 'CL' },
    });
    expect(
      [...picker()!.querySelectorAll('[data-share-pool]')].map((c) =>
        c.getAttribute('data-share-pool'),
      ),
    ).toEqual(['p-club']);
  });

  it('turns several on at once, each on a lane at once, in ink with its lane chip, and the row names them', () => {
    const { container } = render(<Row />);
    fireEvent.click(row(container));
    fireEvent.click(chip('p-test'));
    fireEvent.click(chip('p-crew'));
    // Multi-select: the picker stays open.
    expect(picker()).not.toBeNull();
    expect(shared(container)).toEqual([
      { poolId: 'p-test', poolLaneId: 'te-a' },
      { poolId: 'p-crew', poolLaneId: 'cr-out' },
    ]);
    expect(chip('p-crew').hasAttribute('data-on')).toBe(true);
    expect(chip('p-crew').className).toContain('bg-ink');
    expect(chip('p-crew').querySelector('[data-share-lane="cr-out"]')).not.toBeNull();
    // The row: in the diaries' order, comma-separated, each with its face; no status.
    const r = row(container);
    expect(r.querySelector('[data-share-private]')).toBeNull();
    const summary = r.querySelector('[data-share-summary]')!;
    expect(summary.textContent).toBe('CRCrew,TEtest');
    expect(summary.className).toContain('whitespace-nowrap');
    expect(summary.className).toContain('overflow-hidden');
  });

  it('opens a diary’s lanes from its lane chip inside the picker, and a lane picked moves it there', () => {
    const { container } = render(<Row />);
    fireEvent.click(row(container));
    fireEvent.click(chip('p-ours'));
    const laneChip = chip('p-ours').querySelector<HTMLElement>('[data-share-lane="pl-trips"]')!;
    expect(laneChip.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(laneChip);
    const lanes = picker()!.querySelector('[data-share-lanes="p-ours"]')!;
    expect(lanes.textContent).toContain('Category in Our Pool');
    fireEvent.click(
      [...lanes.querySelectorAll('button')].find((b) => b.textContent?.includes('Food'))!,
    );
    expect(shared(container)).toEqual([{ poolId: 'p-ours', poolLaneId: 'pl-food' }]);
    expect(picker()!.querySelector('[data-share-lanes]')).toBeNull();
    expect(picker()).not.toBeNull();
  });

  it('says Not shared yet again once every diary is off', () => {
    const { container } = render(<Row />);
    fireEvent.click(row(container));
    fireEvent.click(chip('p-crew'));
    expect(row(container).querySelector('[data-share-private]')).toBeNull();
    fireEvent.click(chip('p-crew').querySelector('[aria-pressed="true"]')!);
    expect(row(container).querySelector('[data-share-private]')!.textContent).toBe(
      'Not shared yet',
    );
  });

  it('closes on Esc without the Esc reaching the draft under it', () => {
    const { container } = render(<Row />);
    let reached = 0;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (reached += 1);
    window.addEventListener('keydown', onKey);
    try {
      fireEvent.click(row(container));
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      expect(picker()).toBeNull();
      expect(reached).toBe(0);
    } finally {
      window.removeEventListener('keydown', onKey);
    }
  });

  it('with no diary to share to, says the full private sentence and offers nothing to tap', () => {
    const { container } = render(<Row pools={[]} />);
    const r = row(container);
    expect(r.textContent).toBe('Only you can see this');
    expect(r.tagName).not.toBe('BUTTON');
    expect(r.querySelector('button')).toBeNull();
  });
});

describe('fitNames: the summary’s one line', () => {
  // 6px between names; "+N" 16px wide.
  it('shows them all when they fit, with no +N', () => {
    expect(fitNames([40, 30, 30], 112, 16)).toBe(3);
  });
  it('keeps room for +N when they do not all fit', () => {
    // Two names (40 + 6 + 30) and +1 (6 + 16) = 98.
    expect(fitNames([40, 30, 30], 100, 16)).toBe(2);
    expect(fitNames([40, 30, 30], 97, 16)).toBe(1);
  });
  it('never shows fewer than one, the first then truncated: "test +2"', () => {
    expect(fitNames([200, 30, 30], 80, 16)).toBe(1);
    expect(fitNames([], 80, 16)).toBe(0);
  });
});
