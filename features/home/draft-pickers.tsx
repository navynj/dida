'use client';

import { useState, type ReactNode } from 'react';

import { useWide } from '@/components/ui/use-wide';
import type { Annotation } from '@/features/input-sheet/draft';
import { LaneChips } from '@/features/input-sheet/lane-chips';
import { PoolLanePicker } from '@/features/pool/pool-lane-picker';
import { followHomeLane } from '@/features/pool/share-draft';
import { DayChip } from '@/features/splash/day-chip';
import { isRange } from '@/features/splash/block-day';
import { SheetFrame } from '@/features/splash-sheet/sheet-frame';
import type { Composer } from '@/features/splash-sheet/use-composer';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import type { IsoDate } from '@/lib/time';

import { cardDate } from './grid';

/** A small panel over the card, closed by a tap anywhere outside it. */
function Popover({
  label,
  onClose,
  align,
  children,
}: {
  label: string;
  onClose: () => void;
  align: 'left' | 'right';
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
        className={`border-pool-200 absolute top-full z-40 mt-2 w-72 max-w-[calc(100vw-4rem)] rounded-xl border bg-white p-3 shadow-lg ${
          align === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        {children}
      </div>
    </>
  );
}

const FIELD = 'text-ink bg-pool-100 rounded-md px-2 py-1 text-sm tabular-nums outline-none';

/**
 * The draft's date as the finished card writes it (H80): "Nov 14 (SAT)" in
 * the accent, a range as two of them. A tap opens the picker: the start,
 * `+ Add end date` for a range, and, on a range, the first note's own day
 * (0031). The post always has a date: no × here.
 */
export function DraftDate({ composer: c, today }: { composer: Composer; today: IsoDate }) {
  const [open, setOpen] = useState(false);
  const a: Annotation = c.annotation ?? { date: today, time: null, endDate: null, endTime: null };
  const set = (patch: Partial<Annotation>): void => c.setAnnotation({ ...a, ...patch });
  const label =
    a.endDate && a.endDate !== a.date
      ? `${cardDate(a.date)} – ${cardDate(a.endDate)}`
      : cardDate(a.date);
  return (
    <div className="relative">
      <button
        type="button"
        data-draft-date
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="text-main-900 text-sm font-medium tabular-nums"
      >
        {label}
      </button>
      {open ? (
        <Popover label="Date" onClose={() => setOpen(false)} align="left">
          <div className="flex flex-col gap-3 text-sm">
            <label className="text-pool-500 flex items-center justify-between gap-2">
              Date
              <input
                type="date"
                lang="en"
                aria-label="Date"
                value={a.date}
                onChange={(event) => event.target.value && set({ date: event.target.value })}
                className={FIELD}
              />
            </label>
            {a.endDate === null ? (
              <button
                type="button"
                data-draft-add-end
                onClick={() => set({ endDate: a.date })}
                className="text-main-900 self-start text-sm"
              >
                + Add end date
              </button>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <label className="text-pool-500 flex items-center gap-2">
                  End
                  <input
                    type="date"
                    lang="en"
                    aria-label="End date"
                    value={a.endDate}
                    onChange={(event) =>
                      event.target.value &&
                      set({ endDate: event.target.value === a.date ? null : event.target.value })
                    }
                    className={FIELD}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => set({ endDate: null, endTime: null })}
                  className="text-pool-500 text-xs"
                >
                  Remove
                </button>
              </div>
            )}
            {/* The first note's own day inside the post's range (0031). */}
            {c.firstDay && isRange(c.draftRange) ? (
              <label className="text-pool-500 flex items-center justify-between gap-2">
                First note on
                <DayChip range={c.draftRange} value={c.firstDay} onChange={c.setChosenDay} />
              </label>
            ) : null}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * The draft's category as the finished card shows it (H80): one outline
 * chip at the top right, "+ Category" with none. A tap opens the chips —
 * a popover on a wide screen, a bottom sheet on a phone; from a pool, its
 * lanes and Together (H23, 0033).
 */
export function DraftCategory({
  composer: c,
  pools,
}: {
  composer: Composer;
  pools: AudiencePool[];
}) {
  const [open, setOpen] = useState(false);
  const wide = useWide();
  const { categories, pool } = c;
  const chosen = pool
    ? pool.lanes.find((l) => l.id === c.pick?.poolLaneId)
    : categories.find((cat) => cat.id === c.laneId);
  const picker = pool ? (
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
        setOpen(false);
      }}
      surface="white"
    />
  );
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-draft-category
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="border-pool-100 text-pool-500 inline-flex h-6 items-center gap-1 rounded-full border bg-white px-2.5 text-xs"
      >
        {chosen ? (
          <>
            {chosen.icon ? <span aria-hidden>{chosen.icon}</span> : null}
            {chosen.name}
          </>
        ) : (
          '+ Category'
        )}
      </button>
      {open && wide ? (
        <Popover label="Category" onClose={() => setOpen(false)} align="right">
          {picker}
        </Popover>
      ) : null}
      {open && !wide ? (
        <SheetFrame label="Category" onClose={() => setOpen(false)} bodyClassName="px-6 pt-6">
          {picker}
        </SheetFrame>
      ) : null}
    </div>
  );
}
