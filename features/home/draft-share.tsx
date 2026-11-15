'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { CategoryChip } from '@/components/ui/chips/category-chip';
import { useWide } from '@/components/ui/use-wide';
import { PickerSearch } from '@/features/input-sheet/lane-chips';
import { useStripPools } from '@/features/pool/activity';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import { SheetFrame } from '@/features/splash-sheet/sheet-frame';
import { SharePoolChip, laneOf, type ShareProps } from '@/features/splash-sheet/share-to-row';

import { Popover } from './draft-pickers';

/** The gap between the line's chips, `gap-1.5`. */
const GAP_PX = 6;

/**
 * How many chips of `widths` fit on `room`, in order: whole chips, and the
 * "+N" chip after them when any are left out.
 */
function fit(widths: number[], room: number, plus: number): number {
  for (let k = widths.length; k > 0; k -= 1) {
    const chips = widths.slice(0, k).reduce((sum, w) => sum + w, 0) + GAP_PX * (k - 1);
    const more = k < widths.length ? GAP_PX + plus : 0;
    if (chips + more <= room) return k;
  }
  return 0;
}

/**
 * The draft card's one line of diaries (H80): `full` and `compact` are each
 * chip's width with and without its lane chip, the `selected` ones first.
 * Every selected chip with its lane, as many others as fit, and "+N" for the
 * rest; when the selected ones do not all fit with their lanes, each keeps
 * only its small chevron, which opens its lanes in the picker.
 */
export function layoutLine(
  full: number[],
  compact: number[],
  selected: number,
  room: number,
  plus: number,
): { shown: number; lanes: boolean } {
  const withLanes = fit(full, room, plus);
  if (withLanes >= selected) return { shown: withLanes, lanes: true };
  return { shown: fit(compact, room, plus), lanes: false };
}

/**
 * The diaries, to turn on and off (H75 inside H80): the search field on
 * top, always, then a chip per diary, wrapping onto rows — grey while off,
 * ink when on, its lane chip with the chevron beside its name. The lane
 * chip opens that diary's lanes under the chips, inside the picker.
 */
function SharePicker({
  pools,
  shared,
  startLane,
  onTurn,
  onPick,
  lanesOf,
}: ShareProps & { lanesOf: string | null }) {
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState<string | null>(lanesOf);
  const photos = useStripPools();
  const shown = pools.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));
  const open = pools.find((p) => p.id === choosing && laneOf(shared, p.id));
  return (
    <div data-share-picker className="flex flex-col gap-2">
      <PickerSearch value={query} onChange={setQuery} placeholder="Search diaries" pill />
      <div role="group" aria-label="Share to" className="flex flex-wrap gap-1.5">
        {shown.map((pool) => (
          <SharePoolChip
            key={pool.id}
            pool={pool}
            laneId={laneOf(shared, pool.id)}
            start={startLane(pool.id)}
            photo={photos.find((p) => p.id === pool.id)?.photo ?? null}
            choosing={choosing === pool.id}
            onTurn={(poolLaneId) => {
              if (!poolLaneId && choosing === pool.id) setChoosing(null);
              onTurn(pool.id, poolLaneId);
            }}
            onChoose={() => setChoosing(choosing === pool.id ? null : pool.id)}
          />
        ))}
        {shown.length === 0 ? (
          <p className="text-pool-500 py-1 text-xs">No diary called “{query.trim()}”</p>
        ) : null}
      </div>
      {open ? (
        <div
          data-share-lanes={open.id}
          role="group"
          aria-label={`Category in ${open.name}`}
          className="flex flex-col gap-1.5 pt-1"
        >
          <span className="text-pool-500 text-xs">Category in {open.name}</span>
          <div className="flex flex-wrap gap-1.5">
            {open.lanes.map((lane) => (
              <CategoryChip
                key={lane.id}
                icon={lane.icon}
                name={lane.name}
                selected={lane.id === laneOf(shared, open.id)}
                onSelect={() => {
                  onPick(open.id, lane.id);
                  setChoosing(null);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Share to on the draft card (H80, H75): the diaries in view, on one line
 * that never wraps. Off, a diary reads as the card's other offers, "+ name"
 * in the muted fill — not shared yet, tap to add; on, it is ink (H20f), its
 * lane chip beside it while the line has room. The diaries on come first,
 * so what is shared is never behind "+N"; "+N" takes the last slot when
 * the rest do not fit and opens the picker (a popover on a wide screen, a
 * bottom sheet on a phone, as the category's). With no diary to share to,
 * *Only you can see this*, and nothing to tap.
 */
export function DraftShare(props: ShareProps) {
  const { pools, shared, startLane, onTurn } = props;
  // The picker, and the diary whose lanes it opens on.
  const [open, setOpen] = useState<{ lanesOf: string | null } | null>(null);
  const wide = useWide();
  const photos = useStripPools();
  const line = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  // Unmeasured (the server, a test), every chip shows with its lane.
  const [layout, setLayout] = useState<{ shown: number; lanes: boolean } | null>(null);
  const on = pools.filter((pool) => laneOf(shared, pool.id));
  const ordered = [...on, ...pools.filter((pool) => !laneOf(shared, pool.id))];
  const key = JSON.stringify([pools.map((p) => p.id), shared]);

  useLayoutEffect(() => {
    const measure = (): void => {
      const box = line.current;
      const marks = ruler.current;
      if (!box || !marks) return;
      const room = box.clientWidth;
      if (room === 0) return setLayout(null);
      const width = (selector: string): number =>
        marks.querySelector<HTMLElement>(selector)?.offsetWidth ?? 0;
      setLayout(
        layoutLine(
          ordered.map((p) => width(`[data-ruler-full="${p.id}"]`)),
          ordered.map((p) => width(`[data-ruler-compact="${p.id}"]`)),
          on.length,
          room,
          width('[data-ruler-more]'),
        ),
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined' || !line.current) return;
    const watch = new ResizeObserver(measure);
    watch.observe(line.current);
    return () => watch.disconnect();
    // `key` stands for the diaries and what is shared: the same, the same measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Esc closes the picker alone, not the draft under it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.stopPropagation();
      setOpen(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (pools.length === 0) {
    return (
      <div data-share-to className="flex items-center">
        <span data-share-private className="text-pool-500 text-xs">
          Only you can see this
        </span>
      </div>
    );
  }
  const photoOf = (id: string): string | null => photos.find((p) => p.id === id)?.photo ?? null;
  const shown = Math.min(layout?.shown ?? ordered.length, ordered.length);
  const lanes = layout?.lanes ?? true;
  const chip = (pool: AudiencePool, form: 'line' | 'full' | 'compact') => (
    <SharePoolChip
      pool={pool}
      laneId={laneOf(shared, pool.id)}
      start={startLane(pool.id)}
      photo={photoOf(pool.id)}
      choosing={open?.lanesOf === pool.id}
      plus
      compact={form === 'compact' || (form === 'line' && !lanes)}
      onTurn={(poolLaneId) => onTurn(pool.id, poolLaneId)}
      onChoose={() => setOpen({ lanesOf: pool.id })}
    />
  );
  const close = (): void => setOpen(null);
  return (
    <div data-share-to className="relative flex min-w-0 items-center gap-2">
      <span className="text-pool-500 shrink-0 text-xs">Share to</span>
      <div
        ref={line}
        data-share-line
        className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden"
      >
        {ordered.slice(0, shown).map((pool) => (
          <span key={pool.id} className="contents">
            {chip(pool, 'line')}
          </span>
        ))}
        {shown < ordered.length ? (
          <button
            type="button"
            data-share-more
            aria-haspopup="dialog"
            aria-expanded={open !== null}
            aria-label={`${ordered.length - shown} more diaries`}
            onClick={() => setOpen({ lanesOf: null })}
            className="bg-pool-100 hover:text-ink shrink-0 rounded-full px-2.5 py-1 text-xs text-(--text-inactive)"
          >
            +{ordered.length - shown}
          </button>
        ) : null}
      </div>
      {/* The ruler: each chip as it would be, with its lane and without, out of sight. */}
      <div
        ref={ruler}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute top-0 left-0 flex gap-1.5"
      >
        {ordered.map((pool) => (
          <span key={pool.id} className="contents">
            <span data-ruler-full={pool.id} className="inline-flex">
              {chip(pool, 'full')}
            </span>
            <span data-ruler-compact={pool.id} className="inline-flex">
              {chip(pool, 'compact')}
            </span>
          </span>
        ))}
        <span data-ruler-more className="rounded-full px-2.5 py-1 text-xs">
          +{ordered.length}
        </span>
      </div>
      {open && wide ? (
        <Popover label="Share to" onClose={close} align="left" side="above">
          <SharePicker {...props} lanesOf={open.lanesOf} />
        </Popover>
      ) : null}
      {open && !wide ? (
        <SheetFrame label="Share to" onClose={close} bodyClassName="picker-surface px-6 pt-6">
          <SharePicker {...props} lanesOf={open.lanesOf} />
        </SheetFrame>
      ) : null}
    </div>
  );
}
