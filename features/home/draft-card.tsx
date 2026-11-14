'use client';

import { useEffect, useRef, useState } from 'react';

import { ComposerFields } from '@/features/splash-sheet/composer-fields';
import type { DropHandoff, SheetContext } from '@/features/splash-sheet/splash-composer';
import { useComposer, type ComposerSnapshot } from '@/features/splash-sheet/use-composer';
import type { IsoDate } from '@/lib/time';

import { CARD_PAD_PX } from './card-face';
import type { StackDraft } from './stack-draft';

/**
 * How long the date chip rests before the draft is seated again (H80): a
 * date typed into the field changes with each part, and the stack moves
 * once, when the date is the one meant.
 */
export const RESEAT_MS = 600;

/** The bottom inset the Save row keeps above the home indicator, as the sheet's footer does. */
const BOTTOM_PAD = 'calc(1rem + env(safe-area-inset-bottom, 0px))';

/**
 * The draft card (H80): a new page written where it will live, as the top
 * card of the stack, already in edit mode. The composer's fields inside the
 * card's face (`ComposerFields`, the sheet's own), a small Cancel in its top
 * row and Save pinned to its bottom — the one filled thing on the card
 * (H20f). The fields scroll inside the card; the card never grows past it.
 *
 * The date chip is where the page is seated: once it rests (`RESEAT_MS`),
 * the stack moves the draft to its date's slot. Esc or Cancel discards it;
 * with anything written, Cancel asks first, inside the card.
 */
export function DraftCard({
  draft,
  context,
  onReseat,
  onDiscard,
  onSave,
}: {
  draft: StackDraft;
  context: SheetContext;
  onReseat: (start: IsoDate, end: IsoDate | null) => void;
  onDiscard: () => void;
  onSave: (handoff: DropHandoff, snapshot: ComposerSnapshot) => void;
}) {
  const composer = useComposer({ context, pool: draft.pool, initial: draft.snapshot });
  const [confirming, setConfirming] = useState(false);

  // Seated again once the date rests: the chip's day, its end, else today.
  const start = composer.annotation?.date ?? context.today;
  const end = composer.annotation?.endDate ?? null;
  useEffect(() => {
    const timer = window.setTimeout(() => onReseat(start, end), RESEAT_MS);
    return () => window.clearTimeout(timer);
  }, [start, end, onReseat]);

  const cancel = (): void => {
    if (composer.touched) setConfirming(true);
    else onDiscard();
  };
  // Esc discards, or asks, from anywhere while the draft is open; not
  // while an IME is composing, whose Esc is its own.
  // Asked already, Esc is Keep writing, as a dialog's Esc is.
  const escape = (): void => (confirming ? setConfirming(false) : cancel());
  const cancelRef = useRef(escape);
  useEffect(() => {
    cancelRef.current = escape;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      cancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const save = (): void => {
    // Under the draft's own id, so the post keeps its seat; the photos stay
    // up on a refusal, for the draft opened again with them.
    const snapshot = composer.snapshot();
    onSave(composer.handoff(draft.id, { keepOnRefusal: true }), snapshot);
  };

  return (
    <div
      data-draft-card={draft.id}
      role="form"
      aria-label="New page"
      className="text-ink relative flex h-full flex-col"
    >
      <div
        data-draft-top
        className="flex shrink-0 items-center justify-between px-5"
        style={{ paddingTop: CARD_PAD_PX - 8 }}
      >
        <button
          type="button"
          data-draft-cancel
          onClick={cancel}
          className="text-pool-500 -ml-2 rounded-full px-2 py-1 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
      {draft.error ? (
        <p role="alert" data-draft-error className="text-pool-500 shrink-0 px-5 pt-1 text-sm">
          {draft.error}
        </p>
      ) : null}
      <div
        data-draft-scroll
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-3 pb-4"
      >
        <ComposerFields composer={composer} pools={context.pools} today={context.today} />
      </div>
      {/* Pinned to the card's bottom, in reach above the keyboard. */}
      <div data-draft-footer className="shrink-0 px-5 pt-2" style={{ paddingBottom: BOTTOM_PAD }}>
        <button
          type="button"
          data-draft-save
          disabled={!composer.canCommit}
          onClick={save}
          className="bg-main-900 w-full rounded-full py-2.5 text-lg font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {confirming ? (
        // Asked inside the card, never a browser dialog (H80).
        <div
          role="alertdialog"
          aria-label="Discard this page?"
          data-draft-confirm
          className="surface absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-[24px] bg-white px-6"
        >
          <p className="text-ink text-base font-semibold">Discard this page?</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-draft-keep
              autoFocus
              onClick={() => setConfirming(false)}
              className="border-pool-200 text-ink rounded-full border px-4 py-2 text-sm font-medium"
            >
              Keep writing
            </button>
            <button
              type="button"
              data-draft-discard
              onClick={onDiscard}
              className="text-ink rounded-full px-4 py-2 text-sm font-medium underline-offset-2 hover:underline"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
