'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import { CategoryChip } from '@/components/ui/chips/category-chip';
import { usePeople } from '@/features/people/people-provider';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import { resolvePick } from '@/features/pool/pool-pick';
import { PoolLanePicker } from '@/features/pool/pool-lane-picker';
import { followHomeLane } from '@/features/pool/share-draft';
import type { Composer } from '@/features/splash-sheet/use-composer';

type Lane = { id: string; icon: string | null; name: string };

/** The chosen one first, the rest in the author's order (H80, ninth pass). */
export function frontFirst<T extends { id: string }>(lanes: T[], selectedId: string | null): T[] {
  const chosen = lanes.find((l) => l.id === selectedId);
  return chosen ? [chosen, ...lanes.filter((l) => l !== chosen)] : lanes;
}

/**
 * The composer's category row (H80, ninth pass): the full width, a search
 * button at the left, then every category on one line that scrolls
 * sideways, grey with the chosen one filled and first. A fade at the right
 * edge says more are off-screen. The search button turns the row into a
 * field in place that filters the chips on the same line; × or Escape
 * closes it and keeps the choice. No popover, no sheet. From a pool, its
 * lanes; once one is chosen, Together under the row (0033).
 */
export function DraftCategoryRow({
  composer: c,
  pools,
}: {
  composer: Composer;
  pools: AudiencePool[];
}) {
  const { me } = usePeople();
  const { categories, pool } = c;
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const lanes: Lane[] = pool ? pool.lanes : categories;
  const selectedId = pool ? (c.pick?.poolLaneId ?? null) : c.laneId;
  const needle = query.trim().toLowerCase();
  const shown = frontFirst(lanes, selectedId).filter(
    (l) => !searching || l.name.toLowerCase().includes(needle),
  );

  // Together's state, as the pool's picker reads it, for a lane chosen here.
  const others = pool ? pool.members.filter((m) => m.id !== me).map((m) => m.id) : [];
  const everyone = c.together.everyone;
  const picked = everyone ? others : c.together.picked;

  const choose = (id: string): void => {
    const off = id === selectedId;
    if (pool) {
      c.setPick(off ? null : resolvePick(id, picked, everyone));
      return;
    }
    // Tapping the chosen one lets go of it: no lane is a valid state.
    const next = off ? null : id;
    c.setLaneId(next);
    // Auto pools follow to a lane of the same name, else stay (H75).
    const name = categories.find((cat) => cat.id === next)?.name ?? null;
    c.setShare((draft) => followHomeLane(draft, name, pools));
  };

  const close = (): void => {
    setSearching(false);
    setQuery('');
  };

  useEffect(() => {
    if (searching) field.current?.focus();
  }, [searching]);

  // The fade shows while chips lie past the right edge.
  useLayoutEffect(() => {
    const el = line.current;
    if (!el) return;
    const measure = (): void => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [shown.length, searching, selectedId]);

  // Back to the line's start when the choice moves to the front.
  useEffect(() => {
    line.current?.scrollTo?.({ left: 0 });
  }, [selectedId]);

  return (
    <div className="flex shrink-0 flex-col gap-2 px-5 pt-2">
      <div data-draft-category-row className="flex min-w-0 items-center gap-1.5">
        {searching ? (
          <label
            data-category-search-field
            className="bg-pool-100 text-pool-500 flex w-36 shrink-0 items-center gap-1.5 rounded-full py-1 pr-1 pl-2.5"
          >
            <Search aria-hidden size={13} className="shrink-0" />
            <input
              ref={field}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
                // The search's own Escape: never the card's or the sheet's.
                event.stopPropagation();
                event.preventDefault();
                close();
              }}
              placeholder="Search"
              aria-label="Search categories"
              enterKeyHint="done"
              // 16px: a phone zooms into a smaller field.
              className="placeholder:text-pool-500 text-ink min-w-0 flex-1 bg-transparent text-base/5 outline-none placeholder:opacity-60"
            />
            <button
              type="button"
              aria-label="Close search"
              data-category-search-close
              onClick={close}
              className="-m-0.5 shrink-0 rounded-full p-1"
            >
              <X aria-hidden size={12} />
            </button>
          </label>
        ) : (
          <button
            type="button"
            aria-label="Search categories"
            data-category-search
            onClick={() => setSearching(true)}
            className="bg-pool-100 text-pool-500 hover:text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          >
            <Search aria-hidden size={13} />
          </button>
        )}
        <div
          ref={line}
          role="group"
          aria-label="Category"
          data-category-line
          data-more={more ? '' : undefined}
          className={`no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto ${
            more ? '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]' : ''
          }`}
        >
          {shown.map((lane) => (
            <CategoryChip
              key={lane.id}
              icon={lane.icon}
              name={lane.name}
              selected={lane.id === selectedId}
              data-pick-category={lane.id}
              onSelect={() => choose(lane.id)}
            />
          ))}
          {shown.length === 0 ? (
            <span data-category-none className="text-pool-500 py-1 text-xs whitespace-nowrap">
              No category matches
            </span>
          ) : null}
        </div>
      </div>
      {pool && c.pick ? (
        <PoolLanePicker
          scope={pool}
          pick={c.pick}
          onPick={c.setPick}
          together={c.together}
          onTogether={c.setTogether}
          lanes={false}
        />
      ) : null}
    </div>
  );
}
