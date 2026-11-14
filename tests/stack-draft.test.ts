import { describe, expect, it } from 'vitest';

import { byNewest, placeCard, type Card } from '@/features/home/grid';
import { draftCard, seatDraft, type StackDraft } from '@/features/home/stack-draft';
import { summarizeSplash } from '@/features/splash/summary';

const TZ = 'America/Vancouver';
const TODAY = '2026-09-25';

/** A post on one day, made at noon of it. */
function on(id: string, day: string): Card {
  const created = `${day}T19:00:00.000Z`;
  return placeCard(
    summarizeSplash(
      {
        id,
        owner_id: 'a1',
        title: id,
        declared_start: day,
        declared_end: null,
        declared_lane_id: null,
        icon: null,
        session_id: null,
        pinned_at: null,
        pool_id: null,
        pool_lane_id: null,
        own_pool_id: null,
        created_by: null,
        joint_invite_all: false,
        is_welcome: false,
        description: null,
        type: 'free',
        prompt: null,
        ends_at: null,
        created_at: created,
        written_on: day,
      },
      [{ id: `${id}-b`, note: id, occurred_on: day, occurred_time: null, created_at: created }],
      TZ,
      new Date(created),
    ),
    id,
    TZ,
  );
}

const STACK = [
  on('late', '2026-09-20'),
  on('mid', '2026-09-12'),
  on('mid2', '2026-09-12'),
  on('soup', '2026-09-08'),
  on('aug', '2026-08-17'),
].sort(byNewest);

function draft(start: string, end: string | null = null): StackDraft {
  return {
    id: 'draft',
    start,
    end,
    openedAt: '2026-09-25T18:00:00.000Z',
    pool: null,
    snapshot: null,
    error: null,
  };
}
const seatOf = (start: string, end: string | null = null): number =>
  seatDraft(STACK, draftCard(draft(start, end), TZ, TODAY)).findIndex(
    (card) => card.splash.id === 'draft',
  );

describe('the draft seated by its date (H80)', () => {
  it('opens on today, newest of all', () => {
    expect(seatOf(TODAY)).toBe(0);
  });

  it('moves to its date’s slot among the posts, newest first', () => {
    expect(seatOf('2026-09-15')).toBe(1);
    expect(seatOf('2026-09-10')).toBe(3);
    expect(seatOf('2026-08-01')).toBe(5);
  });

  it('comes before the posts already on its day: written now, it is the newest there', () => {
    expect(seatOf('2026-09-12')).toBe(1);
    expect(seatOf('2026-09-20')).toBe(0);
    expect(seatOf('2026-08-17')).toBe(4);
  });

  it('is seated by a range’s last day, as a post is', () => {
    expect(seatOf('2026-09-01', '2026-09-10')).toBe(3);
  });

  it('keeps everything else in its order, and the stack as it was with no draft', () => {
    const seated = seatDraft(STACK, draftCard(draft('2026-09-10'), TZ, TODAY));
    expect(seated.filter((c) => !c.draft).map((c) => c.splash.id)).toEqual(
      STACK.map((c) => c.splash.id),
    );
    expect(seatDraft(STACK, null)).toBe(STACK);
  });

  it('is seated where the post it becomes will be: the same day, made a moment later', () => {
    const later = { ...draft('2026-09-12'), openedAt: '2026-09-25T18:00:05.000Z' };
    const asDraft = seatOf('2026-09-12');
    const asPost = seatDraft(STACK, draftCard(later, TZ, TODAY)).findIndex(
      (c) => c.splash.id === 'draft',
    );
    expect(asPost).toBe(asDraft);
  });
});
