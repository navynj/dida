import type { ComposerSnapshot } from '@/features/splash-sheet/use-composer';
import type { PoolScope } from '@/features/pool/compose-scope';
import { summarizeSplash } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

import { byNewest, placeCard, type Card } from './grid';

/**
 * A page being written on the stack (H80): not a post yet, but seated among
 * the posts by its date as one will be. Its id is the post's, minted when
 * the draft opens, so on Save the card it becomes is the same card in the
 * same seat.
 */
export type StackDraft = {
  id: string;
  /** The post's date as last committed in the chip: where it is seated. */
  start: IsoDate;
  end: IsoDate | null;
  /** When it was opened: the moment it is seated by among a day's posts. */
  openedAt: string;
  /** Composing from a pool (H23): its lanes and Together. */
  pool: PoolScope | null;
  /** A refused Save opened again (H80): the fields as they were, and why. */
  snapshot: ComposerSnapshot | null;
  error: string | null;
};

/**
 * The draft as a card on the stack and a mark on the grid: an untitled post
 * on its date, written now, summarised the way a dropped post is — so it
 * sorts where the post it becomes will.
 */
export function draftCard(draft: StackDraft, timeZone: string, today: IsoDate): Card {
  const splash = summarizeSplash(
    {
      id: draft.id,
      owner_id: '',
      title: '',
      declared_start: draft.start,
      declared_end: draft.end && draft.end !== draft.start ? draft.end : null,
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
      created_at: draft.openedAt,
      written_on: today,
    },
    [],
    timeZone,
    new Date(draft.openedAt),
  );
  return { ...placeCard(splash, '', timeZone), draft: true };
}

/**
 * The stack with the draft seated by its date (H80): newest first, as
 * every stack is (`byNewest`). Written now, it comes before the posts
 * already on its day.
 */
export function seatDraft(cards: Card[], draft: Card | null): Card[] {
  if (!draft) return cards;
  return [...cards.filter((card) => card.splash.id !== draft.splash.id), draft].sort(byNewest);
}
