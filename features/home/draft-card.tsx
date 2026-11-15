'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { EmojiInput } from '@/features/lanes/emoji-input';
import { fallbackLane } from '@/features/pool/audience';
import { shareLane, shareOff, shareOn } from '@/features/pool/share-draft';
import { ComposeTop } from '@/features/splash-sheet/compose-top';
import type { DropHandoff, SheetContext } from '@/features/splash-sheet/splash-composer';
import { useComposer, type ComposerSnapshot } from '@/features/splash-sheet/use-composer';
import type { IsoDate } from '@/lib/time';

import { DETAIL_TITLE_CLASS } from '@/features/splash/splash-header';

import { DraftImages } from './draft-images';
import { DraftCategory, DraftDate } from './draft-pickers';
import { DraftShare } from './draft-share';
import type { StackDraft } from './stack-draft';

/**
 * How long the date chip rests before the draft is seated again (H80): a
 * date typed into the field changes with each part, and the stack moves
 * once, when the date is the one meant.
 */
export const RESEAT_MS = 600;

/** The bottom inset the footer keeps above the home indicator, as the sheet's does. */
const BOTTOM_PAD = 'calc(0.75rem + env(safe-area-inset-bottom, 0px))';

/** An IME is mid-composition: Chrome flags it, Safari reports keyCode 229. */
function isComposing(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/**
 * The draft card (H80): a new page written where it will live, as the top
 * card of the stack, already in edit mode — and already looking like the
 * card it becomes (`CardFace`). Top to bottom: the icon inline before the
 * title, at the title's size, with `…` at the end of that row; the date
 * line in the card's own style and the category as the card's one chip;
 * the body, filling the card and scrolling inside it; and pinned to the
 * bottom, above the keyboard, the image row and Share to's one summary row
 * (it opens the diaries' picker), then Cancel and a Save that takes the rest
 * of the row.
 *
 * The date is where the page is seated: once it rests (`RESEAT_MS`), the
 * stack moves the draft to its date's slot. Esc or Cancel discards it;
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
  const c = composer;
  const [confirming, setConfirming] = useState(false);
  const titleField = useRef<HTMLTextAreaElement>(null);
  const bodyField = useRef<HTMLTextAreaElement>(null);
  const { categories, pool } = c;
  const pools = context.pools;

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

  // The title grows with what is written, a line at a time; it never
  // scrolls inside itself or shows a bar.
  useLayoutEffect(() => {
    const el = titleField.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [c.titleText]);

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
      {/* The header as the finished card has it (CardFace): the icon and the
          title, `…` at the end of the same row (the description, 0037); then
          the date line and the category's chip. */}
      <div data-draft-title-row className="flex shrink-0 items-center gap-1.5 pt-3 pr-3 pl-5">
        <EmojiInput
          value={c.icon}
          onChange={c.setIcon}
          label="Icon"
          placeholder={
            (pool
              ? pool.lanes.find((l) => l.id === c.pick?.poolLaneId)?.icon
              : categories.find((cat) => cat.id === c.laneId)?.icon) ?? '🙂'
          }
          className="w-10 shrink-0 bg-transparent text-center text-3xl/none"
        />
        <textarea
          ref={titleField}
          value={c.titleText}
          onChange={(event) => c.setTitleText(event.target.value.replace(/\n/g, ''))}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (isComposing(event)) return;
            bodyField.current?.focus();
          }}
          placeholder="Title (optional)"
          rows={1}
          aria-label="Title"
          data-sheet-title
          className={`${DETAIL_TITLE_CLASS} text-main-900 placeholder:text-main-900 min-w-0 flex-1 resize-none overflow-hidden leading-tight outline-none placeholder:opacity-30`}
        />
        <div className="shrink-0 self-start">
          <ComposeTop describing={c.describing} onDescribing={c.setDescribing} />
        </div>
      </div>
      <div
        data-draft-header
        className="flex shrink-0 items-start justify-between gap-3 px-5 pt-1.5"
      >
        <DraftDate composer={c} today={context.today} />
        <DraftCategory composer={c} pools={pools} />
      </div>
      {draft.error ? (
        <p role="alert" data-draft-error className="text-pool-500 shrink-0 px-5 pt-1 text-sm">
          {draft.error}
        </p>
      ) : null}
      {c.describing ? (
        <textarea
          value={c.description}
          onChange={(event) => c.setDescription(event.target.value)}
          autoFocus
          rows={1}
          maxLength={2000}
          placeholder="Describe this page"
          aria-label="Description"
          data-compose-description-field
          className="text-ink placeholder:text-ink border-pool-200 mx-5 mt-2 shrink-0 resize-none border-b pb-3 text-sm/relaxed outline-none placeholder:opacity-30"
        />
      ) : null}
      {/* The body fills what is left and scrolls inside it. Backspace at its
          very start walks back up to the title, as a notes app does. */}
      <textarea
        ref={bodyField}
        value={c.bodyText}
        onChange={(event) => c.setBodyText(event.target.value)}
        onKeyDown={(event) => {
          const el = event.currentTarget;
          if (event.key !== 'Backspace' || el.selectionStart !== 0 || el.selectionEnd !== 0) return;
          if (isComposing(event)) return;
          event.preventDefault();
          const title = titleField.current;
          if (!title) return;
          title.focus();
          title.setSelectionRange(title.value.length, title.value.length);
        }}
        placeholder="Enter the content"
        // The content is what is written first (H75): the cursor starts here.
        autoFocus
        aria-label="Content"
        data-sheet-body
        className="text-ink placeholder:text-ink min-h-16 w-full flex-1 resize-none overflow-y-auto overscroll-contain px-5 pt-3 text-[15px]/relaxed outline-none placeholder:opacity-30"
      />

      {/* Pinned to the card's bottom, above the keyboard: the image row,
          where it is shared, one group on one left edge; then Cancel and
          Save, Save taking the rest of the row. */}
      <div
        data-draft-footer
        className="flex shrink-0 flex-col gap-3 px-5 pt-2"
        style={{ paddingBottom: BOTTOM_PAD }}
      >
        <DraftImages paths={c.mediaPaths} media={c.media} />
        {/* Where it is shared, said while it is written (H75): only from Home. */}
        {pool ? null : (
          <DraftShare
            pools={pools}
            shared={c.audience}
            startLane={(poolId) =>
              fallbackLane(
                categories.find((cat) => cat.id === c.laneId)?.name ?? null,
                pools.find((p) => p.id === poolId)?.lanes ?? [],
              )
            }
            onTurn={(poolId, poolLaneId) =>
              c.setShare((was) =>
                poolLaneId ? shareOn(was, poolId, poolLaneId) : shareOff(was, poolId),
              )
            }
            // Picked by hand: manual for this draft only, never remembered (H75).
            onPick={(poolId, poolLaneId) => c.setShare((was) => shareLane(was, poolId, poolLaneId))}
          />
        )}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            data-draft-cancel
            onClick={cancel}
            className="text-pool-500 -ml-2 rounded-full px-2 py-1.5 text-sm font-medium"
          >
            Cancel
          </button>
          {/* The one filled thing on the card: action (H20f). */}
          <button
            type="button"
            data-draft-save
            disabled={!c.canCommit}
            onClick={save}
            className="bg-main-900 flex-1 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-30"
          >
            Save
          </button>
        </div>
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
