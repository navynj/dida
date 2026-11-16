// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

import { CardFace } from '@/features/home/card-face';
import { placeCard, type Card } from '@/features/home/grid';
import { PeopleProvider } from '@/features/people/people-provider';
import type { SplashSummary } from '@/features/splash/summary';

afterEach(cleanup);

const SUMMARY = {
  id: 's',
  title: 'Arnak league',
  ghostTitle: null,
  description: null,
  declaredLaneId: null,
  icon: '🎲',
  laneIds: [],
  declaredRange: null,
  range: { start: '2026-10-26', end: '2026-10-26' },
  count: 1,
  blocks: [],
  latestCreatedAt: '2026-10-26T18:00:00Z',
  writtenOn: '2026-10-26',
  ownPoolId: null,
  open: true,
  createdAt: '2026-10-26T18:00:00Z',
  pinnedAt: null,
  sessionId: null,
  orphan: false,
} satisfies SplashSummary;

const LANE = { icon: '🎬', name: 'Media' };

function face(over: Partial<Card> = {}, compact = false) {
  const card = { ...placeCard(SUMMARY, 'Mina won by two', 'UTC'), ...over };
  return render(
    <PeopleProvider me="u-me" people={{ 'u-me': { name: 'Yoonji', photo: null } }}>
      <CardFace card={card} lane={LANE} initials="YL" edge="full" compact={compact} />
    </PeopleProvider>,
  );
}

/** The rows in the order the card draws them. */
const rows = (c: HTMLElement) =>
  [
    ...c.querySelectorAll(
      '[data-card-date-row], [data-card-title], [data-card-meta-row], [data-card-body]',
    ),
  ].map((el) =>
    ['data-card-date-row', 'data-card-title', 'data-card-meta-row', 'data-card-body'].find((a) =>
      el.hasAttribute(a),
    ),
  );

describe('a card face is the page’s skeleton (H80, tenth pass)', () => {
  for (const compact of [false, true]) {
    const where = compact ? 'the phone’s top card' : 'a wide top card';
    it(`on ${where}: date row, title row, meta row, then the notes`, () => {
      const { container } = face({}, compact);
      expect(rows(container)).toEqual([
        'data-card-date-row',
        'data-card-title',
        'data-card-meta-row',
        'data-card-body',
      ]);
      expect(container.querySelector('[data-card-date]')!.textContent).toBe('Oct 26 (MON)');
      // Clear of the menu's `…` over the row's right end.
      expect(container.querySelector('[data-card-date-row]')!.className).toContain('pr-8');
      // The title keeps its icon inline and the card's size.
      const title = container.querySelector('[data-card-title]')!;
      expect(title.textContent).toBe('🎲Arnak league');
      // The meta row: the author at the left, the category's outline chip at the right.
      const meta = container.querySelector('[data-card-meta-row]')!;
      expect(
        meta.firstElementChild!.querySelector('[data-card-author="u-me"]')!.textContent,
      ).toContain('Yoonji');
      expect(meta.lastElementChild!.textContent).toBe('🎬Media');
      expect(meta.lastElementChild!.className).toContain('h-5');
      // Smaller than the sheet's: a 20px face, xs name.
      expect(meta.querySelector('[data-card-author] span')!.className).toContain('h-5');
    });
  }

  it('writes a range as the page does', () => {
    const { container } = face({
      splash: { ...SUMMARY, range: { start: '2026-11-14', end: '2026-11-16' } },
    });
    expect(container.querySelector('[data-card-date]')!.textContent).toBe('Nov 14 – Nov 16');
  });

  it('draws nothing for a private page: private carries no marker (H78d)', () => {
    const { container } = face();
    expect(container.querySelector('[data-card-diary-chip]')).toBeNull();
    expect(container.querySelector('[data-card-date-row]')!.textContent).toBe('Oct 26 (MON)');
  });

  it('names one diary by its monogram and name, in the page’s outline chip', () => {
    const { container } = face({ sharedPools: [{ name: 'Our Pool', photo: null }] });
    const chip = container.querySelector('[data-card-date-row] [data-card-diary-chip]')!;
    expect(chip.querySelector('.truncate')!.textContent).toBe('Our Pool');
    expect(chip.querySelector('[data-monogram]')).not.toBeNull();
    expect(chip.className).toContain('border-pool-200');
    expect(chip.className).not.toMatch(/bg-(ink|\(--accent)/);
  });

  it('says N diaries from two', () => {
    const { container } = face({
      sharedPools: [
        { name: 'Our Pool', photo: null },
        { name: 'Crew', photo: null },
        { name: 'Family', photo: null },
      ],
    });
    expect(container.querySelector('[data-card-diary-chip]')!.textContent).toBe('3 diaries');
  });

  it('has no "Pool · lane" line and no lone avatar: the chip and the meta row carry them', () => {
    const { container } = face({
      sharedPools: [{ name: 'Our Pool', photo: null }],
      origins: ['Our Pool · ☀ Day'],
    });
    expect(container.querySelector('[data-origin-tags], [data-origin-tag]')).toBeNull();
    expect(container.textContent).not.toContain('Our Pool · ☀ Day');
    // One person's notes: plain, the face once on the meta row.
    expect(container.querySelector('[data-ripple-thread]')!.hasAttribute('data-plain')).toBe(true);
    expect(container.querySelectorAll('[data-thread-avatar]')).toHaveLength(0);
  });

  it('keeps each note’s avatar once someone else has written on it', () => {
    const { container } = face({
      ripples: [
        { id: 'a', note: 'mine', createdAt: '2026-10-26T18:00:00Z' },
        {
          id: 'b',
          note: 'theirs',
          createdAt: '2026-10-26T19:00:00Z',
          authorId: 'u-mina',
          initials: 'MI',
        },
      ],
    });
    expect(container.querySelector('[data-ripple-thread]')!.hasAttribute('data-plain')).toBe(false);
    expect(container.querySelectorAll('[data-thread-avatar]')).toHaveLength(2);
  });

  it('still says a page is no longer shared, where the place line used to', () => {
    const { container } = face({ pools: ['Our Pool'], origins: ['No longer shared'] });
    expect(container.querySelector('[data-card-gone]')!.textContent).toBe('No longer shared');
  });

  it('leaves the stair’s title strips as they were', () => {
    const card = placeCard(SUMMARY, 'words', 'UTC');
    for (const edge of ['top', 'bottom'] as const) {
      const { container } = render(<CardFace card={card} lane={LANE} initials="YL" edge={edge} />);
      expect(container.querySelector('[data-card-title]')).not.toBeNull();
      expect(container.querySelector('[data-card-date-row], [data-card-meta-row]')).toBeNull();
      cleanup();
    }
  });
});
