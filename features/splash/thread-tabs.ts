import type { RippleResponsesValue } from '@/features/responses/model';

import { threadCount } from './thread-count';

/** A diary my record is shared to, or was (off, or handed over): a tab it may get (0035). */
export type ThreadPlace = { poolId: string; label: string; off: boolean };

/** A diary's tab: its place, what it counts, and when anything was last written there. */
export type ThreadTab = ThreadPlace & { count: number; latest: string };

/** Tabs show from this many responding diaries (H33, H75 revised); fewer, the labels say it. */
export const TABS_FROM = 2;

/**
 * The diaries that get a tab on my record's page (H33, H75; 2026-11-16):
 * only those where anyone wrote — a note in that diary's thread, a reply or
 * a reaction there — newest response first. Read from what the page holds
 * now, so a first response adds its tab and deleting the last takes it away.
 */
export function respondingThreads(
  places: ThreadPlace[],
  notes: { author_id: string | null; thread_pool_id: string | null; created_at: string }[],
  responses: RippleResponsesValue,
  me: string,
): ThreadTab[] {
  const tabs: ThreadTab[] = [];
  for (const place of places) {
    const times = [
      ...notes.filter((n) => n.thread_pool_id === place.poolId).map((n) => n.created_at),
      ...responses.replies
        .filter((r) => r.thread_pool_id === place.poolId)
        .map((r) => r.created_at),
      ...responses.reactions
        .filter((r) => r.thread_pool_id === place.poolId)
        .map((r) => r.created_at),
    ];
    if (times.length === 0) continue;
    const latest = times.reduce((a, b) => (new Date(b) > new Date(a) ? b : a));
    tabs.push({
      ...place,
      latest,
      count: threadCount(place.poolId, me, notes, responses.replies),
    });
  }
  return tabs.sort((a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime());
}
