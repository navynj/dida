'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { CategoryChip } from '@/components/ui/chips/category-chip';
import { Monogram } from '@/components/ui/monogram';
import { useWide } from '@/components/ui/use-wide';
import { PickerSearch } from '@/features/input-sheet/lane-chips';
import { useStripPools } from '@/features/pool/activity';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import { SheetFrame } from '@/features/splash-sheet/sheet-frame';
import { SharePoolChip, laneOf, type ShareProps } from '@/features/splash-sheet/share-to-row';

import { Popover } from './draft-pickers';

/** The gap between the summary's names, `gap-1.5`. */
const GAP_PX = 6;

/**
 * How many of the shared diaries' names fit on the summary's one line
 * (H80): as many as fit whole with room left for "+N" for the rest; all of
 * them when they fit without it; never fewer than one, the first truncated.
 */
export function fitNames(widths: number[], room: number, plus: number): number {
  const n = widths.length;
  for (let k = n; k > 1; k -= 1) {
    const names = widths.slice(0, k).reduce((sum, w) => sum + w, 0) + GAP_PX * (k - 1);
    if (names + (k < n ? GAP_PX + plus : 0) <= room) return k;
  }
  return Math.min(n, 1);
}

/** One shared diary in the summary: its face and its name, a comma after when another follows. */
function Named({
  pool,
  photo,
  comma,
  truncate = false,
}: {
  pool: AudiencePool;
  photo: string | null;
  comma: boolean;
  truncate?: boolean;
}) {
  return (
    <span
      data-share-named={pool.id}
      className={`inline-flex items-center gap-1 ${truncate ? 'min-w-0' : 'shrink-0'}`}
    >
      <Monogram name={pool.name} size="chip" photo={photo} />
      <span className={truncate ? 'truncate' : ''}>
        {pool.name}
        {comma ? ',' : ''}
      </span>
    </span>
  );
}

/**
 * The shared diaries, on one line whatever their number (H80): face and
 * name, comma-separated, and "+N" for those that do not fit. A hidden copy
 * of every name is measured against the row's width.
 */
function Summary({ on, photoOf }: { on: AudiencePool[]; photoOf: (id: string) => string | null }) {
  const row = useRef<HTMLSpanElement>(null);
  const ruler = useRef<HTMLSpanElement>(null);
  // Unmeasured (the server, a test), every name shows.
  const [shown, setShown] = useState(on.length);
  const key = on.map((p) => p.id).join(',');
  useLayoutEffect(() => {
    const measure = (): void => {
      const box = row.current;
      const marks = ruler.current;
      if (!box || !marks) return;
      const room = box.parentElement?.clientWidth ?? 0;
      if (room === 0) return setShown(on.length);
      const items = [...marks.querySelectorAll<HTMLElement>('[data-share-named]')];
      const plus = marks.querySelector<HTMLElement>('[data-ruler-plus]')?.offsetWidth ?? 0;
      setShown(
        fitNames(
          items.map((el) => el.offsetWidth),
          room,
          plus,
        ),
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined' || !row.current?.parentElement) return;
    const watch = new ResizeObserver(measure);
    watch.observe(row.current.parentElement);
    return () => watch.disconnect();
    // `key` stands for `on`: the same diaries, the same measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const rest = on.length - Math.min(shown, on.length);
  return (
    <span className="relative flex min-w-0 flex-1 items-center">
      <span
        ref={row}
        data-share-summary
        className="text-ink flex min-w-0 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap"
      >
        {on.slice(0, shown).map((pool, i) => (
          <Named
            key={pool.id}
            pool={pool}
            photo={photoOf(pool.id)}
            comma={i < shown - 1}
            truncate={i === shown - 1}
          />
        ))}
        {rest > 0 ? (
          <span data-share-more className="text-pool-500 shrink-0">
            +{rest}
          </span>
        ) : null}
      </span>
      {/* The ruler: every name at its natural width, out of sight. */}
      <span
        ref={ruler}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex gap-1.5 text-xs whitespace-nowrap"
      >
        {on.map((pool, i) => (
          <Named key={pool.id} pool={pool} photo={photoOf(pool.id)} comma={i < on.length - 1} />
        ))}
        <span data-ruler-plus>+{on.length}</span>
      </span>
    </span>
  );
}

/**
 * The diaries, to turn on and off (H75 inside H80): the search field on
 * top, always, then a chip per diary, wrapping onto rows — grey while off,
 * ink when on, its lane chip with the chevron beside its name. The lane
 * chip opens that diary's lanes under the chips, inside the picker.
 */
function SharePicker({ pools, shared, startLane, onTurn, onPick }: ShareProps) {
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState<string | null>(null);
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
 * Share to on the draft card (H80, H75): one row whatever the number of
 * diaries, so it never reflows as they grow — *Share to*, what it is
 * shared to, a chevron; the whole row one tap, opening the picker (a
 * popover on a wide screen, a bottom sheet on a phone, as the category's).
 * None on, *Not shared yet*. With no diary to share to, *Only you can see
 * this*, and nothing to tap.
 */
export function DraftShare(props: ShareProps) {
  const { pools, shared } = props;
  const [open, setOpen] = useState(false);
  const wide = useWide();
  const photos = useStripPools();
  // Esc closes the picker alone, not the draft under it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.stopPropagation();
      setOpen(false);
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
  const on = pools.filter((pool) => laneOf(shared, pool.id));
  const photoOf = (id: string): string | null => photos.find((p) => p.id === id)?.photo ?? null;
  return (
    <div className="relative">
      <button
        type="button"
        data-share-to
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="-my-1 flex w-full min-w-0 items-center gap-2 py-1 text-left"
      >
        <span className="text-pool-500 shrink-0 text-xs">Share to</span>
        {on.length === 0 ? (
          <span data-share-private className="text-pool-500 min-w-0 flex-1 text-xs">
            Not shared yet
          </span>
        ) : (
          <Summary on={on} photoOf={photoOf} />
        )}
        <ChevronDown aria-hidden size={14} className="text-pool-500 shrink-0" />
      </button>
      {open && wide ? (
        <Popover label="Share to" onClose={() => setOpen(false)} align="left" side="above">
          <SharePicker {...props} />
        </Popover>
      ) : null}
      {open && !wide ? (
        <SheetFrame
          label="Share to"
          onClose={() => setOpen(false)}
          bodyClassName="picker-surface px-6 pt-6"
        >
          <SharePicker {...props} />
        </SheetFrame>
      ) : null}
    </div>
  );
}
