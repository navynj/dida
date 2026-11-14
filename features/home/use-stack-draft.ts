'use client';

import { useCallback, useMemo, useState } from 'react';

import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import type { PoolScope } from '@/features/pool/compose-scope';
import type { DropHandoff } from '@/features/splash-sheet/splash-composer';
import type { ComposerSnapshot } from '@/features/splash-sheet/use-composer';
import type { IsoDate } from '@/lib/time';

import type { Card } from './grid';
import { draftCard, type StackDraft } from './stack-draft';

export type StackDraftApi = {
  draft: StackDraft | null;
  /** The draft as a card, seated by its date; null when none is open. */
  card: Card | null;
  /** Compose: a new draft on today, unless one is already open. */
  open: (pool?: PoolScope | null) => void;
  /** The date committed in the chip: the draft is seated again. */
  reseat: (start: IsoDate, end: IsoDate | null) => void;
  discard: () => void;
  /**
   * Save (H80): the draft becomes the post in the same seat — the same
   * optimistic drop the sheet made — and leaves edit mode. A refusal opens
   * the draft again with its fields and says why.
   */
  save: (handoff: DropHandoff, snapshot: ComposerSnapshot) => void;
};

/** The draft card's state, shared by Home's ground and a pool's (H80). */
export function useStackDraft(timeZone: string, today: IsoDate): StackDraftApi {
  const { markDropped, dropFailed } = useInputSheet();
  const [draft, setDraft] = useState<StackDraft | null>(null);

  const open = useCallback(
    (pool: PoolScope | null = null) =>
      setDraft(
        (current) =>
          current ?? {
            id: crypto.randomUUID(),
            start: today,
            end: null,
            openedAt: new Date().toISOString(),
            pool,
            snapshot: null,
            error: null,
          },
      ),
    [today],
  );
  const reseat = useCallback(
    (start: IsoDate, end: IsoDate | null) =>
      setDraft((current) =>
        current && (current.start !== start || current.end !== end)
          ? { ...current, start, end }
          : current,
      ),
    [],
  );
  const discard = useCallback(() => setDraft(null), []);
  const save = useCallback(
    (handoff: DropHandoff, snapshot: ComposerSnapshot) => {
      if (!draft) return;
      const was = draft;
      // One render: the draft goes and the post takes its seat, same id.
      setDraft(null);
      markDropped({
        splash: handoff.splash,
        month: handoff.month,
        note: handoff.note,
        pool: handoff.pool,
        home: handoff.home,
      });
      // The commit revalidates: the page comes back with its answer.
      void handoff.commit().then((result) => {
        if (result.ok) return;
        dropFailed(result.message);
        // Nothing was written: the page is a draft again, as it was. Past
        // the splash, it exists, and only the message stands.
        // A draft opened since is left as it is.
        if (!result.landed)
          setDraft((current) => current ?? { ...was, snapshot, error: result.message });
      });
    },
    [draft, markDropped, dropFailed],
  );

  const card = useMemo(
    () => (draft ? draftCard(draft, timeZone, today) : null),
    [draft, timeZone, today],
  );
  return { draft, card, open, reseat, discard, save };
}
