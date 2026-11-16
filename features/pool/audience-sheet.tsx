'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Lock, MoreHorizontal, Users } from 'lucide-react';

import { CategoryChip } from '@/components/ui/chips/category-chip';
import { useWide } from '@/components/ui/use-wide';
import { usePeople } from '@/features/people/people-provider';
import type { PoolFace, PoolLaneChip } from '@/lib/queries/pools';

import { audienceLabel, NOBODY, type AudiencePick, type PickTogether } from './audience';
import { MoveToHome, type MoveHome } from './move-to-home';
import { AudiencePopover } from './audience-popover';
import { WithLine } from './with-line';
import { Switch } from './switch';
import { PoolSheet, SheetTitle } from './sheet';

/** A pool I am in, with its lanes and members: one row in Audience. */
export type AudiencePool = {
  id: string;
  name: string;
  lanes: PoolLaneChip[];
  members?: PoolFace[];
};

/**
 * The Audience chip (H23, 0033): one compact chip beside the lane picker in
 * the composer and in a record's header, saying where it is shared — *Only
 * me*, "<Pool> · <emoji> <pool lane>", or *N pools*. A tap opens the sheet.
 * A joint record has no chip: it belongs to its pool.
 */
export function AudienceChip({
  shared,
  pools,
  preselect,
  onChange,
  onTogether,
  locked = null,
  moveHome = null,
  invite = false,
  outline = false,
}: {
  /** Where the record is shared now: a pool lane per pool. */
  shared: AudiencePick[];
  /** Every pool I am in: a row each. */
  pools: AudiencePool[];
  /** The lane a pool starts on when turned on (fallbackLane, H75); none only for a pool with no lanes. */
  preselect: (poolId: string) => string | null;
  /** A pool on a pool lane, or off (null). */
  onChange: (poolId: string, poolLaneId: string | null) => void;
  /** With, per pool that is on (0035); absent, no With line. */
  onTogether?: (poolId: string, together: PickTogether) => void;
  /** My record written in a pool (0056): its pool, always on, its lane still picked. */
  locked?: string | null;
  /** The same record (H45): the header's `…` offers Move to Home. */
  moveHome?: MoveHome | null;
  /** A record's header (H75): shared nowhere, it reads *Only me* with a *Share* to open the sheet. */
  invite?: boolean;
  /**
   * A record's header (H80): where it is shared is membership, not a choice
   * being made, so it is an outline chip as a record's tags are — never the
   * ink fill, which says selection while it is written.
   */
  outline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wide = useWide();
  const trigger = useRef<HTMLButtonElement>(null);
  const on = shared.filter((pick) => pools.some((p) => p.id === pick.poolId));
  // One picker per breakpoint (H75, wide): a popover under the control on a
  // wide screen, the bottom sheet on a phone.
  const sheet = !open ? null : wide ? (
    <AudiencePopover
      trigger={trigger}
      pools={pools}
      shared={on}
      preselect={preselect}
      onChange={onChange}
      onTogether={onTogether}
      locked={locked}
      moveHome={moveHome}
      onClose={() => setOpen(false)}
    />
  ) : (
    <AudienceSheet
      pools={pools}
      shared={on}
      preselect={preselect}
      onChange={onChange}
      onTogether={onTogether}
      locked={locked}
      moveHome={moveHome}
      onClose={() => setOpen(false)}
    />
  );
  if (invite && on.length === 0 && !locked) {
    // Private said in words, and the way out of it beside them (H75).
    return (
      <>
        <span data-audience-private className="relative inline-flex shrink-0 items-center gap-2">
          <span className="bg-pool-100 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-(--text-inactive)">
            <Lock aria-hidden size={13} className="text-pool-500 shrink-0" />
            Only me
          </span>
          <button
            ref={trigger}
            type="button"
            data-audience-chip
            aria-label="Share: Only me"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            className="text-main-900 text-sm font-semibold"
          >
            Share
          </button>
          {wide ? sheet : null}
        </span>
        {wide ? null : sheet}
      </>
    );
  }
  return (
    <span className="relative inline-flex shrink-0">
      <button
        ref={trigger}
        type="button"
        data-audience-chip
        aria-label={`Audience: ${chipLabel(on, pools)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        // In the composer, as Share to's chip (H78m): ink when shared,
        // surface-1 when not. On a record, an outline a step lighter than
        // the hairline, surface-3 (H80): a chip, not a rule.
        data-outline={outline && on.length > 0 ? '' : undefined}
        className={`inline-flex max-w-[12rem] shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
          on.length === 0
            ? 'bg-pool-100 hover:text-ink text-(--text-inactive)'
            : outline
              ? 'text-pool-500 hover:text-ink border border-(--surface-3) bg-transparent py-[3px]'
              : 'bg-ink text-white'
        }`}
      >
        <Users aria-hidden size={12} className="shrink-0 opacity-70" />
        <span className="truncate">{chipLabel(on, pools)}</span>
      </button>
      {sheet}
    </span>
  );
}

/** "Only me", "Our Pool · 🎲 Games", or "N pools". */
export function chipLabel(shared: AudiencePick[], pools: AudiencePool[]): string {
  if (shared.length === 1) {
    const pool = pools.find((p) => p.id === shared[0].poolId);
    const lane = pool?.lanes.find((l) => l.id === shared[0].poolLaneId);
    if (pool && lane) return `${pool.name} · ${lane.icon ? `${lane.icon} ` : ''}${lane.name}`;
  }
  return audienceLabel(
    shared.map((pick) => pools.find((p) => p.id === pick.poolId)?.name ?? 'A diary'),
  );
}

/**
 * The Audience's head (H45): its title, and with Move to Home a `…` at the
 * right whose menu offers it, asking which lane under the head.
 */
export function AudienceHead({ title, moveHome }: { title: ReactNode; moveHome: MoveHome | null }) {
  // Closed, open, or asking which lane.
  const [menu, setMenu] = useState<'closed' | 'open' | 'moving'>('closed');
  return (
    <>
      <div className="relative flex items-start justify-between gap-4">
        {title}
        {moveHome ? (
          <button
            type="button"
            aria-label="More"
            aria-expanded={menu !== 'closed'}
            data-audience-more
            onClick={() => setMenu(menu === 'closed' ? 'open' : 'closed')}
            className="text-pool-500 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          >
            <MoreHorizontal aria-hidden size={18} />
          </button>
        ) : null}
        {moveHome && menu === 'open' ? (
          // In ink, the selection channel, as the card's menu.
          <ul
            role="menu"
            data-audience-menu
            className="surface bg-ink absolute top-8 right-0 z-20 flex w-64 flex-col rounded-xl py-1 text-sm text-white shadow-lg"
          >
            <li>
              <button
                type="button"
                role="menuitem"
                data-audience-move-home
                onClick={() => setMenu('moving')}
                className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left"
              >
                <span>Move to Home</span>
                <span className="text-xs text-white/70">
                  Keeps it shared here, and lets you turn this diary off later.
                </span>
              </button>
            </li>
          </ul>
        ) : null}
      </div>
      {moveHome && menu === 'moving' ? (
        <div className="mb-5">
          <MoveToHome
            move={{
              ...moveHome,
              onMove: (laneId) => {
                setMenu('closed');
                moveHome.onMove(laneId);
              },
            }}
            onCancel={() => setMenu('closed')}
          />
        </div>
      ) : null}
    </>
  );
}

/** What every Audience picker is told: the rows, and what a change does. */
export type AudienceRowsProps = {
  pools: AudiencePool[];
  shared: AudiencePick[];
  preselect: (poolId: string) => string | null;
  onChange: (poolId: string, poolLaneId: string | null) => void;
  onTogether?: (poolId: string, together: PickTogether) => void;
  locked: string | null;
};

/**
 * Where a record is shared (0033): a row per pool I am in, each with a
 * switch. Turned on, it is shared at once on the lane it starts on, and the
 * row shows that pool's lane chips to change it (H75); only a pool with no
 * lanes waits for one, with nothing shared yet. `named`: the phone's sheet
 * says *Shared to <diary>*; the wide popover the name alone, the switch
 * saying the rest (H75, wide).
 */
export function AudienceRows({
  pools,
  shared,
  preselect,
  onChange,
  onTogether,
  locked,
  named = 'shared-to',
  face = null,
  empty = 'You are in no diary yet.',
}: AudienceRowsProps & {
  /** Said when there is no row: no diary, or none matching the search. */
  empty?: string;
  named?: 'shared-to' | 'name';
  /** Each diary's monogram or photo, before its name (the popover). */
  face?: ((pool: AudiencePool) => ReactNode) | null;
}) {
  const { me } = usePeople();
  // Turned on with no chip to start on: shown on, shared only once picked.
  const [waiting, setWaiting] = useState<string[]>([]);
  const laneOf = (poolId: string): string | null =>
    shared.find((pick) => pick.poolId === poolId)?.poolLaneId ?? null;
  return (
    <ul className="flex flex-col">
      {pools.map((pool) => {
        const lane = laneOf(pool.id);
        const on = lane !== null || waiting.includes(pool.id);
        const name = named === 'shared-to' ? `Shared to ${pool.name}` : pool.name;
        return (
          <li
            key={pool.id}
            data-audience-row={pool.id}
            className="border-pool-100 flex flex-col gap-3 border-b py-3 last:border-b-0"
          >
            <span className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2">
                {face ? face(pool) : null}
                <span className="flex min-w-0 flex-col">
                  <span data-audience-name className="text-ink truncate">
                    {name}
                  </span>
                  {pool.id === locked ? (
                    // Written there (0056): it cannot be turned off; its lane can change.
                    <span data-audience-origin className="text-pool-500 text-xs">
                      Written here, always shared
                    </span>
                  ) : null}
                </span>
              </span>
              <Switch
                on={on}
                disabled={pool.id === locked}
                tone="ink"
                label={`Shared to ${pool.name}`}
                onChange={(next) => {
                  if (!next) {
                    setWaiting((list) => list.filter((id) => id !== pool.id));
                    onChange(pool.id, null);
                    return;
                  }
                  const start = preselect(pool.id);
                  if (start) onChange(pool.id, start);
                  else setWaiting((list) => [...list, pool.id]);
                }}
              />
            </span>
            {on ? (
              <span
                data-audience-lanes={pool.id}
                className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1"
              >
                {/* The lane row's own chips, as in Share to (H75). */}
                {pool.lanes.map((chip) => (
                  <CategoryChip
                    key={chip.id}
                    icon={chip.icon}
                    name={chip.name}
                    selected={chip.id === lane}
                    data-audience-lane={chip.id}
                    onSelect={() => {
                      setWaiting((list) => list.filter((id) => id !== pool.id));
                      onChange(pool.id, chip.id);
                    }}
                  />
                ))}
              </span>
            ) : null}
            {/* With, in this pool (0035): once it sits on a pool lane. */}
            {lane && onTogether ? (
              <WithLine
                poolId={pool.id}
                faces={(pool.members ?? []).filter((m) => m.id !== me)}
                together={shared.find((p) => p.poolId === pool.id)?.together ?? NOBODY}
                onChange={(next) => onTogether(pool.id, next)}
              />
            ) : null}
          </li>
        );
      })}
      {pools.length === 0 ? (
        <li data-audience-empty className="text-pool-500 py-3 text-sm">
          {empty}
        </li>
      ) : null}
    </ul>
  );
}

/** The helper line, the same on both breakpoints. */
export const AUDIENCE_HELP =
  'Every note on this page follows it. With every switch off, it is yours alone.';

/**
 * Audience on a phone (0033): the bottom sheet, its title, the helper line,
 * the Diaries section (so a *Followers* row can join later without
 * reshaping it; only Diaries is built), and Done.
 */
function AudienceSheet({
  moveHome,
  onClose,
  ...rows
}: AudienceRowsProps & { moveHome: MoveHome | null; onClose: () => void }) {
  return (
    <PoolSheet label="Audience" onClose={onClose}>
      <AudienceHead title={<SheetTitle>Audience</SheetTitle>} moveHome={moveHome} />
      <p className="text-pool-500 -mt-2 mb-5 text-sm">{AUDIENCE_HELP}</p>
      <section data-audience-section="Diaries" className="mb-6">
        <h3 className="text-pool-500 mb-1 text-xs">Diaries</h3>
        <AudienceRows {...rows} />
      </section>
      {/* Each switch and chip applies as it is touched, so this only closes:
          Done, as the edit sheet's (review, 2026-10-31). */}
      <button
        type="button"
        data-audience-done
        onClick={onClose}
        className="border-pool-200 text-ink w-full rounded-full border py-2.5 text-base font-medium"
      >
        Done
      </button>
    </PoolSheet>
  );
}
