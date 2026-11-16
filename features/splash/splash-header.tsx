'use client';

import { useState, useTransition, type ReactNode } from 'react';

import { OutlineChip } from '@/components/ui/chips/category-chip';
import { AnnotationControl, QuietAffordance } from '@/features/input-sheet/annotation-control';
import { LaneChips } from '@/features/input-sheet/lane-chips';
import { EmojiInput } from '@/features/lanes/emoji-input';
import type { MyCategory } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';

import { cardDate } from '@/features/home/grid';

import { shortDay } from './block';
import { HeaderMenu } from './header-menu';
import type { DateRange, SplashSummary } from './summary';

/** The title's size and weight on a post's page; the top card on Home reads at the same (review). */
export const DETAIL_TITLE_CLASS = 'text-3xl font-semibold';

/** The date's words, the draft card's (H80): the accent, small, medium. */
const DATE_WORDS = 'text-main-900 text-sm font-medium tabular-nums';

export type HeaderEdit = {
  title: string;
  /** The post's own icon (0008), or none. */
  icon: string | null;
  declaredStart: IsoDate | null;
  declaredEnd: IsoDate | null;
  declaredLaneId: string | null;
};

/**
 * A post's header (SPEC 5), the composer's skeleton (H80, ninth pass): the
 * date as the card writes it at the left of the top row, the share status
 * and the quiet menu (pin, Delete) at its right; the icon inline before the
 * title at display scale; the meta row, who wrote it at the left and the
 * category's chip at the right. Under them, everyone in it once others have added theirs, and
 * where it sits in a pool (H75). Title, icon, declared date and declared
 * lane are edited in place.
 */
export function SplashHeader({
  splash,
  categories,
  today,
  onEdit,
  onPin,
  onDelete,
  audience = null,
  editLevel = 'all',
  canPin = true,
  canDelete = true,
  laneChip = undefined,
  description = null,
  author = null,
  byline = null,
  place = null,
}: {
  splash: SplashSummary;
  categories: MyCategory[];
  today: IsoDate;
  onEdit: (edit: HeaderEdit) => Promise<void>;
  onPin: (pinned: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  /** The Audience chip (H23), beside the lane tags; absent when I am in no pool. */
  audience?: ReactNode;
  /**
   * What may be edited in place (review): all of it on my own splash; the
   * title, icon and dates on a joint splash (any current member, H74);
   * nothing on someone else's.
   */
  editLevel?: 'all' | 'title' | 'none';
  canPin?: boolean;
  canDelete?: boolean;
  /** In a pool: the pool lane's chip in place of my lane tags (others' lanes are theirs). */
  laneChip?: { icon: string | null; name: string } | null;
  /**
   * The description's field, asked for from the menu (review): hidden until
   * Add description, and Hide description takes it away again. Null where
   * it is not mine to write.
   */
  description?: { shown: boolean; onToggle: () => void } | null;
  /** Who wrote it, at the left of the meta row. */
  author?: ReactNode;
  /** Everyone in it, under the meta row: only once others have added theirs. */
  byline?: ReactNode;
  /** Where it sits in a pool ("Pool · 🏕 lane"), on its own line under the byline (H75). */
  place?: ReactNode;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(splash.title);
  const [icon, setIcon] = useState(splash.icon ?? '');
  const [editingDate, setEditingDate] = useState(false);
  const [range, setRange] = useState<{ start: IsoDate; end: IsoDate | null } | null>(
    // Every post has a date (H24): its own, else the day it was made. An end
    // on the start's day reads as one field, the drop sheet's (oneDay).
    splash.range ? { start: splash.range.start, end: oneDay(splash.range) } : null,
  );
  const [editingLane, setEditingLane] = useState(false);
  const [, startTransition] = useTransition();

  const header = (over: Partial<HeaderEdit> = {}): HeaderEdit => ({
    title: title.trim(),
    icon: splash.icon,
    declaredStart: range?.start ?? null,
    declaredEnd: range ? oneDay(range) : null,
    declaredLaneId: splash.declaredLaneId,
    ...over,
  });
  const run = (work: () => Promise<void>): void => startTransition(work);

  const tags = splash.laneIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is MyCategory => Boolean(c));
  const displayRange: DateRange | null = splash.range;

  return (
    <header data-splash-header className="flex flex-col gap-2 pb-6">
      {/* The composer's skeleton (H80, ninth pass): the date as the card
          writes it at the left, edited in place; the share status and the
          menu at the right, as they were. */}
      <div data-splash-top-row className="flex min-h-7 items-center justify-between gap-3">
        <div data-splash-date className="min-w-0 flex-1">
          {editLevel === 'none' ? (
            displayRange ? (
              <span data-range className={DATE_WORDS}>
                {cardRange(displayRange)}
              </span>
            ) : (
              <span />
            )
          ) : editingDate ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
              {/* The drop sheet's own date control (H24: a date is changed, never removed). */}
              <AnnotationControl
                annotation={{
                  date: range?.start ?? today,
                  time: null,
                  endDate: range?.end ?? null,
                  endTime: null,
                }}
                today={today}
                onChange={(next) => next && setRange({ start: next.date, end: next.endDate })}
                clock={false}
                removable={false}
              />
              <button
                type="button"
                onClick={() => {
                  const next = range ?? { start: today, end: null };
                  setRange(next);
                  setEditingDate(false);
                  run(() =>
                    onEdit(header({ declaredStart: next.start, declaredEnd: oneDay(next) })),
                  );
                }}
                className="text-main-900 font-medium"
              >
                Done
              </button>
            </div>
          ) : displayRange ? (
            <button
              type="button"
              aria-label="Edit the declared date"
              data-range
              onClick={() => setEditingDate(true)}
              className={`${DATE_WORDS} text-left`}
            >
              {cardRange(displayRange)}
            </button>
          ) : (
            <QuietAffordance onClick={() => setEditingDate(true)} label="+ Add Date" />
          )}
        </div>

        {audience}

        <HeaderMenu
          pinned={splash.pinnedAt !== null}
          count={splash.count}
          canPin={canPin}
          canDelete={canDelete}
          description={description}
          onPin={onPin}
          onDelete={onDelete}
        />
      </div>

      {/* The title, edited where it is read; the compact bar shows once it is gone (H75). */}
      <div data-splash-title-row className="flex items-start gap-1.5">
        {/* The post's own icon inline before the title at its size, as the
          composer has it (0008): one glyph, saved as it is chosen; emptied,
          the lane's emoji stands for the post again. */}
        {editLevel === 'none' ? (
          splash.icon ? (
            <span aria-hidden data-splash-icon className="shrink-0 text-3xl/9">
              {splash.icon}
            </span>
          ) : null
        ) : (
          <EmojiInput
            value={icon}
            onChange={(next) => {
              setIcon(next);
              if ((next || null) !== splash.icon) run(() => onEdit(header({ icon: next || null })));
            }}
            label="Icon"
            placeholder={categories.find((c) => c.id === splash.laneIds[0])?.icon ?? '🙂'}
            className="h-9 w-10 shrink-0 bg-transparent text-center text-3xl/9"
          />
        )}
        <div className="min-w-0 flex-1">
          {editLevel === 'none' ? (
            <h1 data-splash-title className={`text-ink ${DETAIL_TITLE_CLASS}`}>
              {splash.title.trim() ? (
                splash.title
              ) : (
                <span className="opacity-30">{splash.ghostTitle ?? 'Untitled'}</span>
              )}
            </h1>
          ) : editingTitle ? (
            <input
              value={title}
              autoFocus
              aria-label="Title"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (title.trim() !== splash.title.trim()) run(() => onEdit(header()));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setTitle(splash.title);
                  setEditingTitle(false);
                }
              }}
              className={`text-ink w-full ${DETAIL_TITLE_CLASS} outline-none`}
            />
          ) : (
            <button
              type="button"
              aria-label="Edit the title"
              onClick={() => setEditingTitle(true)}
              className="text-left"
            >
              <h1 data-splash-title className={`text-ink ${DETAIL_TITLE_CLASS}`}>
                {splash.title.trim() ? (
                  splash.title
                ) : (
                  <span className="opacity-30">{splash.ghostTitle ?? 'Untitled'}</span>
                )}
              </h1>
            </button>
          )}
        </div>
      </div>

      {/* The meta row (H80, ninth pass): who wrote it at the left, the
          category's outline chip at the right, edited in place; the
          category's chips open under the row. */}
      <div data-splash-meta-row className="flex items-center justify-between gap-3">
        <div data-splash-owner className="min-w-0 flex-1">
          {author}
        </div>
        {/* The post's lane (H24): every block takes it. Tapping it edits it. */}
        {editLevel !== 'all' ? (
          <span
            data-lane-tags
            className="flex min-h-5 min-w-0 flex-wrap items-center justify-end gap-1"
          >
            {laneChip ? (
              <OutlineChip icon={laneChip.icon} name={laneChip.name} />
            ) : (
              tags.map((lane) => <OutlineChip key={lane.id} icon={lane.icon} name={lane.name} />)
            )}
          </span>
        ) : editingLane ? null : (
          <button
            type="button"
            aria-label="Edit the declared category"
            data-lane-tags
            onClick={() => setEditingLane(true)}
            className="flex min-h-5 min-w-0 flex-wrap items-center justify-end gap-1"
          >
            {tags.map((lane) => (
              <OutlineChip key={lane.id} icon={lane.icon} name={lane.name} />
            ))}
            {tags.length === 0 ? (
              <span className="text-pool-500 text-[10px]">+ Category</span>
            ) : null}
          </button>
        )}
      </div>

      {editLevel === 'all' && editingLane ? (
        // The chips open under the row, full width, as the draft's picker.
        <div data-lane-picker className="flex min-w-0 flex-col gap-2">
          <LaneChips
            categories={categories}
            selectedId={splash.declaredLaneId}
            surface="white"
            onSelect={(id) => {
              setEditingLane(false);
              run(() => onEdit(header({ declaredLaneId: id })));
            }}
          />
          <button
            type="button"
            onClick={() => setEditingLane(false)}
            className="text-pool-500 self-start text-xs"
          >
            Done
          </button>
        </div>
      ) : null}

      {byline || place ? (
        // Everyone in it once others have added theirs (H75), then where it
        // sits in a pool on a line of its own, so a name is never cut short.
        <div data-splash-byline className="flex flex-col gap-1.5 pt-1">
          {byline ? <div className="min-w-0">{byline}</div> : null}
          {place ? <div className="min-w-0">{place}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

/** The date as the card writes it (H80): "Oct 2 (FRI)", a range "Nov 14 – Nov 16". */
export function cardRange(range: DateRange): string {
  return range.end > range.start
    ? `${shortDay(range.start)} – ${shortDay(range.end)}`
    : cardDate(range.start);
}

/** A range's end, or none when it ends on its start's day: a one-day post stores no end. */
export function oneDay(range: { start: IsoDate; end: IsoDate | null }): IsoDate | null {
  return range.end === range.start ? null : range.end;
}
