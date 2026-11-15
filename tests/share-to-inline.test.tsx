// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DraftShare, layoutLine } from '@/features/home/draft-share';
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

/**
 * jsdom lays nothing out: a line `room` wide, each chip 80px (120 with its
 * lane chip), "+N" 30. Undone after each test.
 */
function layOut(room: number): () => void {
  const proto = HTMLElement.prototype;
  const client = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
  const offset = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-share-line') ? room : 0;
    },
  });
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.hasAttribute('data-ruler-more')) return 30;
      if (this.hasAttribute('data-ruler-compact')) return 80;
      if (this.hasAttribute('data-ruler-full'))
        return this.querySelector('[data-share-lane]') ? 120 : 80;
      return 0;
    },
  });
  // Put back as they were: an own property, or none (clientWidth is Element's).
  const restore = (name: string, was: PropertyDescriptor | undefined): void => {
    if (was) Object.defineProperty(proto, name, was);
    else Reflect.deleteProperty(proto, name);
  };
  return () => {
    restore('clientWidth', client);
    restore('offsetWidth', offset);
  };
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

const line = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-share-line]')!;
/** The chips on the line, in order: not the hidden ruler's. */
const onLine = (c: HTMLElement) =>
  [...line(c).querySelectorAll<HTMLElement>('[data-share-pool]')].map((el) =>
    el.getAttribute('data-share-pool'),
  );
const lineChip = (c: HTMLElement, id: string) =>
  line(c).querySelector<HTMLElement>(`[data-share-pool="${id}"]`)!;
const picker = () => document.querySelector<HTMLElement>('[data-share-picker]');
const pickerChip = (id: string) =>
  picker()!.querySelector<HTMLElement>(`[data-share-pool="${id}"]`)!;
const shared = (c: HTMLElement): AudiencePick[] =>
  JSON.parse(c.querySelector('[data-shared]')!.textContent!);

describe('Share to on the draft card: the diaries on one line (H80, H75)', () => {
  let undo: (() => void) | null = null;
  beforeEach(() => media(false));
  afterEach(() => {
    undo?.();
    undo = null;
  });

  it('shows every diary as a "+" offer, muted on the light fill, on a line that never wraps, with no status text', () => {
    const { container } = render(<Row />);
    const row = container.querySelector('[data-share-to]')!;
    expect(row.firstElementChild!.textContent).toBe('Share to');
    expect(line(container).className).toContain('flex-nowrap');
    expect(line(container).className).not.toContain('flex-wrap');
    expect(onLine(container)).toEqual(POOLS.map((p) => p.id));
    const crew = lineChip(container, 'p-crew');
    expect(crew.textContent).toBe('+CRCrew');
    expect(crew.className).toContain('bg-pool-100');
    expect(crew.className).toContain('text-(--text-inactive)');
    expect(crew.getAttribute('aria-pressed')).toBe('false');
    // The "+" says it is not shared yet: no sentence beside it.
    expect(row.textContent).not.toContain('Not shared yet');
    expect(row.querySelector('[data-share-private]')).toBeNull();
  });

  it('turns a diary on from the line: ink, no "+", its lane chip with the chevron, and first on the line', () => {
    const { container } = render(<Row />);
    fireEvent.click(lineChip(container, 'p-fam'));
    expect(shared(container)).toEqual([{ poolId: 'p-fam', poolLaneId: 'fa-a' }]);
    const fam = lineChip(container, 'p-fam');
    expect(fam.hasAttribute('data-on')).toBe(true);
    expect(fam.className).toContain('bg-ink');
    expect(fam.textContent).not.toContain('+');
    expect(fam.querySelector('[data-share-lane="fa-a"] svg')).not.toBeNull();
    expect(onLine(container)[0]).toBe('p-fam');
    // Off again, back to its "+" in its own place.
    fireEvent.click(fam.querySelector('[aria-pressed="true"]')!);
    expect(onLine(container)).toEqual(POOLS.map((p) => p.id));
    expect(lineChip(container, 'p-fam').textContent).toBe('+FAFamily');
  });

  it('shows as many as fit and "+N" in the last slot, which opens the picker', () => {
    // 80 + 6 + 80 + 6 + 30 = 202: two chips and +4.
    undo = layOut(210);
    const { container } = render(<Row />);
    expect(onLine(container)).toEqual(['p-ours', 'p-crew']);
    const more = line(container).querySelector<HTMLElement>('[data-share-more]')!;
    expect(more.textContent).toBe('+4');
    expect(line(container).lastElementChild).toBe(more);
    fireEvent.click(more);
    const p = picker()!;
    expect(p.querySelector('[aria-label="Search"]')).not.toBeNull();
    expect(p.querySelectorAll('[data-share-pool]')).toHaveLength(POOLS.length);
  });

  it('puts what is on first, so a diary turned on in the picker is never behind "+N"', () => {
    undo = layOut(210);
    const { container } = render(<Row />);
    fireEvent.click(line(container).querySelector('[data-share-more]')!);
    fireEvent.click(pickerChip('p-work'));
    // The one on with its lane, 120, then +5: 120 + 6 + 30 fits, and one more (+ 86) does not.
    expect(onLine(container)).toEqual(['p-work']);
    expect(lineChip(container, 'p-work').querySelector('[data-share-lane]')).not.toBeNull();
    expect(line(container).querySelector('[data-share-more]')!.textContent).toBe('+5');
  });

  it('keeps only the small chevron on the diaries on when they do not fit with their lanes', () => {
    undo = layOut(210);
    const { container } = render(<Row />);
    fireEvent.click(line(container).querySelector('[data-share-more]')!);
    fireEvent.click(pickerChip('p-work'));
    fireEvent.click(pickerChip('p-club'));
    // With lanes 120 + 6 + 120 > 210; without, 80 + 6 + 80 + 6 + 30 = 202.
    expect(onLine(container)).toEqual(['p-club', 'p-work']);
    const work = lineChip(container, 'p-work');
    expect(work.className).toContain('bg-ink');
    // The lane's name goes; its chevron stays, and opens the picker on its lanes.
    expect(work.textContent).not.toContain('Lunch');
    const chevron = work.querySelector<HTMLElement>('[data-share-lane="wf-a"]')!;
    expect(chevron.querySelector('svg')).not.toBeNull();
    expect(chevron.getAttribute('aria-label')).toBe('Category in Work friends: Lunch. Change it');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(picker()).toBeNull();
    fireEvent.click(chevron);
    expect(picker()!.querySelector('[data-share-lanes="p-work"]')).not.toBeNull();
  });

  it('opens the picker on that diary’s lanes from a lane chip on the line, and a lane picked moves it', () => {
    const { container } = render(<Row />);
    fireEvent.click(lineChip(container, 'p-ours'));
    fireEvent.click(lineChip(container, 'p-ours').querySelector('[data-share-lane]')!);
    const lanes = picker()!.querySelector('[data-share-lanes="p-ours"]')!;
    expect(lanes.textContent).toContain('Category in Our Pool');
    fireEvent.click(
      [...lanes.querySelectorAll('button')].find((b) => b.textContent?.includes('Food'))!,
    );
    expect(shared(container)).toEqual([{ poolId: 'p-ours', poolLaneId: 'pl-food' }]);
  });

  it('closes the picker on Esc without the Esc reaching the draft under it', () => {
    undo = layOut(210);
    const { container } = render(<Row />);
    let reached = 0;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (reached += 1);
    window.addEventListener('keydown', onKey);
    try {
      fireEvent.click(line(container).querySelector('[data-share-more]')!);
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      expect(picker()).toBeNull();
      expect(reached).toBe(0);
    } finally {
      window.removeEventListener('keydown', onKey);
    }
  });

  it.each([
    ['a phone: a bottom sheet', false],
    ['a wide screen: a popover', true],
  ])('opens the picker on %s, the search field always on top', (_, wide) => {
    media(wide);
    undo = layOut(210);
    const { container } = render(<Row pools={POOLS.slice(0, 3)} />);
    fireEvent.click(line(container).querySelector('[data-share-more]')!);
    const p = picker()!;
    expect(p.closest('[data-sheet-frame]') === null).toBe(wide);
    expect(p.closest('[role="dialog"]')).not.toBeNull();
    expect(p.firstElementChild!.querySelector('[aria-label="Search"]')).not.toBeNull();
    fireEvent.change(p.querySelector('[aria-label="Search"]')!, { target: { value: 'CR' } });
    expect(
      [...p.querySelectorAll('[data-share-pool]')].map((c) => c.getAttribute('data-share-pool')),
    ).toEqual(['p-crew']);
  });

  it('with no diary to share to, draws no row at all: no choice, no private marker (H78d)', () => {
    const { container } = render(<Row pools={[]} />);
    expect(container.querySelector('[data-share-to]')).toBeNull();
    expect(container.querySelector('[data-share-private]')).toBeNull();
    expect(container.textContent).not.toContain('Only you can see this');
  });
});

describe('layoutLine: the one line', () => {
  // 6px between chips; "+N" 30px.
  it('shows them all, with their lanes, when they fit', () => {
    expect(layoutLine([120, 80], [80, 80], 1, 206, 30)).toEqual({ shown: 2, lanes: true });
  });
  it('keeps the last slot for +N when they do not', () => {
    expect(layoutLine([80, 80, 80], [80, 80, 80], 0, 210, 30)).toEqual({
      shown: 2,
      lanes: true,
    });
    expect(layoutLine([80, 80, 80], [80, 80, 80], 0, 20, 30)).toEqual({ shown: 0, lanes: true });
  });
  it('drops the lanes’ names before it hides a diary that is on', () => {
    expect(layoutLine([120, 120, 80], [80, 80, 80], 2, 210, 30)).toEqual({
      shown: 2,
      lanes: false,
    });
    // Without their lanes' names both fit, no +N: what is on is never hidden to make room.
    expect(layoutLine([200, 80], [80, 80], 1, 170, 30)).toEqual({ shown: 2, lanes: false });
  });
});
