'use client';

import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

import type { Annotation } from '@/features/input-sheet/draft';
import { shortDay } from '@/features/splash/block';
import { DayChip } from '@/features/splash/day-chip';
import { isRange } from '@/features/splash/block-day';
import type { Composer } from '@/features/splash-sheet/use-composer';
import type { IsoDate } from '@/lib/time';

import { cardDate } from './grid';

/**
 * A picker's panel over the card (H80): white, the soft shadow at most, no
 * outline; closed by a tap anywhere outside it. `picker-surface` gives the
 * chips inside their surface-1 fill back, which the filled card (H82) maps
 * to white.
 */
export function Popover({
  label,
  onClose,
  align,
  side = 'below',
  children,
}: {
  label: string;
  onClose: () => void;
  align: 'left' | 'right';
  /** Under its control, or over it: the footer's controls open upward, into the card. */
  side?: 'below' | 'above';
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close"
        data-popover-close
        onClick={onClose}
        className="fixed inset-0 z-30 cursor-default"
      />
      <div
        role="dialog"
        aria-label={label}
        className={`picker-surface absolute z-40 w-72 max-w-[calc(100vw-4rem)] rounded-xl bg-white p-3 shadow-lg ${
          side === 'below' ? 'top-full mt-2' : 'bottom-full mb-2'
        } ${align === 'left' ? 'left-0' : 'right-0'}`}
      >
        {children}
      </div>
    </>
  );
}

/**
 * Opens a date input's own picker from a tap (H80): `showPicker()` where the
 * browser has it, else focus, which opens it on a phone. Called inside the
 * tap, the gesture `showPicker` needs.
 */
export function openPicker(input: HTMLInputElement | null): void {
  if (!input) return;
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch {
      // Not allowed here (no gesture, or a frame): focus instead.
    }
  }
  input.focus();
}

/** A date written as the card writes it, opening its own picker on a tap. */
function DateButton({
  value,
  label,
  data,
  onChange,
  className,
  children,
}: {
  value: IsoDate;
  label: string;
  data: Record<`data-${string}`, string>;
  onChange: (day: IsoDate) => void;
  className: string;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        {...data}
        aria-label={`${label}: ${cardDate(value)}`}
        onClick={() => openPicker(input.current)}
        className={className}
      >
        {children}
      </button>
      {/* The native picker's anchor, under the words it changes. */}
      <input
        ref={input}
        type="date"
        lang="en"
        tabIndex={-1}
        aria-label={label}
        value={value}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </span>
  );
}

const DATE_WORDS = 'text-main-900 text-sm font-medium tabular-nums';

/**
 * The draft's date as the finished card writes it (H80): "Nov 14 (SAT)" in
 * the accent. One tap opens the date picker itself, no panel between; `+
 * Add end date` after it, in the inactive grey, opens the end's picker
 * straight away, and a range reads "Nov 14 – Nov 16", each date its own
 * picker, with a small × for the
 * end. On a range, the first note's own day (0031) is a select under it.
 * The post always has a date: no × on the start.
 */
export function DraftDate({ composer: c, today }: { composer: Composer; today: IsoDate }) {
  const a: Annotation = c.annotation ?? { date: today, time: null, endDate: null, endTime: null };
  const set = (patch: Partial<Annotation>): void => c.setAnnotation({ ...a, ...patch });
  const ranged = a.endDate !== null && a.endDate !== a.date;
  const addEnd = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
        <DateButton
          value={a.date}
          label="Date"
          data={{ 'data-draft-date': '' }}
          onChange={(date) =>
            // An end before the new start is let go, not reversed.
            set({ date, endDate: a.endDate && a.endDate > date ? a.endDate : null })
          }
          className={DATE_WORDS}
        >
          {/* A range reads "Nov 14 – Nov 16"; a single day keeps its weekday. */}
          {ranged ? shortDay(a.date) : cardDate(a.date)}
        </DateButton>
        {ranged ? (
          <>
            <span aria-hidden className="text-main-900">
              –
            </span>
            <DateButton
              value={a.endDate!}
              label="End date"
              data={{ 'data-draft-end': '' }}
              onChange={(endDate) => set({ endDate: endDate > a.date ? endDate : null })}
              className={DATE_WORDS}
            >
              {shortDay(a.endDate!)}
            </DateButton>
            <button
              type="button"
              data-draft-remove-end
              aria-label="Remove end date"
              onClick={() => set({ endDate: null, endTime: null })}
              className="-m-1 rounded-full p-1 text-(--text-inactive)"
            >
              <X aria-hidden size={12} />
            </button>
          </>
        ) : (
          <span className="relative inline-flex">
            <button
              type="button"
              data-draft-add-end
              onClick={() => openPicker(addEnd.current)}
              // Smaller and lighter than the date: an option, not a field to fill.
              // The weight lightens it; the colour stays text-inactive, 4.5:1.
              className="text-xs font-light text-(--text-inactive)"
            >
              + Add end date
            </button>
            <input
              ref={addEnd}
              type="date"
              lang="en"
              tabIndex={-1}
              aria-label="End date"
              min={a.date}
              value={a.date}
              onChange={(event) => {
                const endDate = event.target.value;
                if (endDate && endDate > a.date) set({ endDate });
              }}
              className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
            />
          </span>
        )}
      </div>
      {/* The first note's own day inside the post's range (0031): in place,
          no step to reach it. */}
      {c.firstDay && ranged && isRange(c.draftRange) ? (
        <label className="text-pool-500 flex items-center gap-2 text-xs">
          First note on
          <DayChip range={c.draftRange} value={c.firstDay} onChange={c.setChosenDay} />
        </label>
      ) : null}
    </div>
  );
}
