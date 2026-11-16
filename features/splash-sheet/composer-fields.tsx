'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { AnnotationControl } from '@/features/input-sheet/annotation-control';
import { LaneChips } from '@/features/input-sheet/lane-chips';
import { EmojiInput } from '@/features/lanes/emoji-input';
import { AddImageAffordance, MediaPreviews } from '@/features/input-sheet/media-field';
import { fallbackLane } from '@/features/pool/audience';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import { followHomeLane, shareLane, shareOff, shareOn } from '@/features/pool/share-draft';
import { PoolLanePicker } from '@/features/pool/pool-lane-picker';
import { DayChip } from '@/features/splash/day-chip';
import { isRange } from '@/features/splash/block-day';
import type { IsoDate } from '@/lib/time';

import { ComposeTop } from './compose-top';
import { ShareToRow } from './share-to-row';
import type { Composer } from './use-composer';

/** An IME is mid-composition: Chrome flags it, Safari reports keyCode 229. */
function isComposing(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/**
 * The composer's fields (SPEC 6, H21, H75), with no frame and no commit: a
 * small optional title field over the content, which takes the cursor
 * first — Enter in the title still moves on to the content — then the
 * post's date chip preset to today, `+ Add Image`, the lane chip row (the
 * post's lane) and, from Home, where it is shared. The same fields inside
 * the post sheet and on the draft card (H80); each frame adds its own
 * commit row.
 */
export function ComposerFields({
  composer: c,
  pools,
  today,
  autoFocus = true,
  footer,
}: {
  composer: Composer;
  pools: AudiencePool[];
  today: IsoDate;
  autoFocus?: boolean;
  /** The frame's commit row, last. */
  footer?: ReactNode;
}) {
  const { categories, pool } = c;
  const field = useRef<HTMLTextAreaElement>(null);
  const bodyField = useRef<HTMLTextAreaElement>(null);

  // The fields grow with their words; the frame's cap does the clipping.
  useLayoutEffect(() => {
    for (const el of [field.current, bodyField.current]) {
      if (!el) continue;
      el.style.height = 'auto';
      if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
    }
  }, [c.titleText, c.bodyText]);

  return (
    <div data-splash-composer className="flex flex-col gap-5">
      {/* The title, small and optional (H75): most records are a photo and
          a line, and a big title field asked for a name every time. Left
          empty, the record is untitled (H21). Enter moves on to the body;
          not while an IME is composing (Korean, say): that Enter commits
          the character, and moving focus on it would carry the character
          into the body. */}
      <div className="flex items-center gap-3">
        {/* The post's own icon: one glyph from the phone's emoji keyboard,
          shown large; left empty, the lane's emoji stands for the post. */}
        <EmojiInput
          value={c.icon}
          onChange={c.setIcon}
          label="Icon"
          placeholder={categories.find((cat) => cat.id === c.laneId)?.icon ?? '🙂'}
        />
        <textarea
          ref={field}
          value={c.titleText}
          onChange={(event) => c.setTitleText(event.target.value.replace(/\n/g, ''))}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (isComposing(event)) return;
            bodyField.current?.focus();
          }}
          placeholder="Title"
          rows={1}
          aria-label="Title"
          data-sheet-title
          className="text-ink placeholder:text-ink min-w-0 flex-1 resize-none text-lg/snug font-semibold outline-none placeholder:opacity-30"
        />
        {/* `…` beside the title, not on a line of its own above it, so the
            sheet does not open on an empty top (Yoonji, in the session). */}
        <ComposeTop describing={c.describing} onDescribing={c.setDescribing} />
      </div>
      {/* The description, only once asked for (review): under the title,
          small, its placeholder faint, and a divider under it as on the
          post's page (Yoonji, in the session), so it is not taken for the
          body. */}
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
          className="text-ink placeholder:text-ink border-pool-100 -mt-2 w-full resize-none border-b pb-4 text-sm/relaxed outline-none placeholder:opacity-30"
        />
      ) : null}
      {/* Backspace at the very start of the body walks the cursor back up
          to the end of the title, the way a notes app does. */}
      <textarea
        ref={bodyField}
        value={c.bodyText}
        onChange={(event) => c.setBodyText(event.target.value)}
        onKeyDown={(event) => {
          const el = event.currentTarget;
          if (event.key !== 'Backspace' || el.selectionStart !== 0 || el.selectionEnd !== 0) return;
          if (isComposing(event)) return;
          event.preventDefault();
          const title = field.current;
          if (!title) return;
          title.focus();
          title.setSelectionRange(title.value.length, title.value.length);
        }}
        placeholder="Enter the content"
        rows={3}
        // The content is what is written first (H75): the cursor starts here.
        autoFocus={autoFocus}
        aria-label="Content"
        data-sheet-body
        className="text-ink placeholder:text-ink min-h-20 w-full resize-none text-lg/relaxed outline-none placeholder:opacity-30"
      />

      {/* The date and a photo come first, above the lane (review). */}
      <div className="flex flex-wrap items-center gap-2">
        <AnnotationControl
          annotation={c.annotation}
          today={today}
          onChange={c.setAnnotation}
          clock={false}
          label="+ Add Date"
        />
        {/* The first block's day inside the post's range (0031). */}
        {c.firstDay && isRange(c.draftRange) ? (
          <DayChip range={c.draftRange} value={c.firstDay} onChange={c.setChosenDay} />
        ) : null}
        <AddImageAffordance
          attach={c.media.attach}
          busy={c.media.busy}
          input={c.media.input}
          progress={c.media.progress}
        />
      </div>
      <MediaPreviews
        paths={c.mediaPaths}
        previews={c.media.previews}
        failed={c.media.failed}
        onChange={c.media.change}
      />

      {/* The post's lane: every block of it takes this one (H24).
          From a pool: its lanes and Together, and no audience (H23, 0033). */}
      {pool ? (
        <PoolLanePicker
          scope={pool}
          pick={c.pick}
          onPick={c.setPick}
          together={c.together}
          onTogether={c.setTogether}
        />
      ) : (
        <LaneChips
          categories={categories}
          selectedId={c.laneId}
          onSelect={(id) => {
            c.setLaneId(id);
            // Auto pools follow to a lane of the same name, else stay (H75).
            const name = categories.find((cat) => cat.id === id)?.name ?? null;
            c.setShare((draft) => followHomeLane(draft, name, pools));
          }}
          surface="white"
        />
      )}

      {/* Where it is shared, said while it is written (H75): only from Home. */}
      {pool ? null : (
        <ShareToRow
          pools={pools}
          shared={c.audience}
          startLane={(poolId) =>
            fallbackLane(
              categories.find((cat) => cat.id === c.laneId)?.name ?? null,
              pools.find((p) => p.id === poolId)?.lanes ?? [],
            )
          }
          onTurn={(poolId, poolLaneId) =>
            c.setShare((draft) =>
              poolLaneId ? shareOn(draft, poolId, poolLaneId) : shareOff(draft, poolId),
            )
          }
          // Picked by hand: manual for this draft only, never remembered (H75).
          onPick={(poolId, poolLaneId) =>
            c.setShare((draft) => shareLane(draft, poolId, poolLaneId))
          }
        />
      )}

      {footer}
    </div>
  );
}
