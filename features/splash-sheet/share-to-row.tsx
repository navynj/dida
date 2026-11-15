'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { CategoryChip } from '@/components/ui/chips/category-chip';
import { Monogram } from '@/components/ui/monogram';
import type { AudiencePick } from '@/features/pool/audience';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import { useStripPools } from '@/features/pool/activity';

import { ShareLanePicker } from './share-lane-picker';

/** What the Share to controls are told, wherever they are drawn (H75). */
export type ShareProps = {
  pools: AudiencePool[];
  shared: AudiencePick[];
  /** The lane a pool starts on when turned on (fallbackLane), or none. */
  startLane: (poolId: string) => string | null;
  /** A pool turned on, on its starting lane, or off (null). */
  onTurn: (poolId: string, poolLaneId: string | null) => void;
  /** A lane picked by hand in the pool's lane picker. */
  onPick: (poolId: string, poolLaneId: string) => void;
};

/** The lane a pool is shared on, or none while it is off. */
export function laneOf(shared: AudiencePick[], poolId: string): string | null {
  return shared.find((pick) => pick.poolId === poolId)?.poolLaneId ?? null;
}

/**
 * One pool's toggle chip (H75): its photo or monogram and its name, in the
 * grey fill while off. Turned on it is ink and carries its lane as the lane
 * row's own chip with a chevron: the name and face toggle the pool, the lane
 * chip only asks for that pool's lanes (`onChoose`).
 */
export function SharePoolChip({
  pool,
  laneId,
  start,
  photo,
  choosing,
  onTurn,
  onChoose,
}: {
  pool: AudiencePool;
  laneId: string | null;
  start: string | null;
  photo: string | null;
  /** Its lanes are open. */
  choosing: boolean;
  onTurn: (poolLaneId: string | null) => void;
  onChoose: () => void;
}) {
  const lane = pool.lanes.find((l) => l.id === laneId);
  const face = <Monogram name={pool.name} size="chip" photo={photo} />;
  if (!lane) {
    return (
      <button
        type="button"
        data-share-pool={pool.id}
        aria-pressed={false}
        disabled={!start}
        onClick={() => onTurn(start)}
        className="bg-pool-100 hover:text-ink inline-flex max-w-[14rem] items-center gap-1 rounded-full px-2.5 py-1 text-xs text-(--text-inactive) disabled:opacity-40"
      >
        {face}
        <span className="truncate">{pool.name}</span>
      </button>
    );
  }
  return (
    <span
      data-share-pool={pool.id}
      data-on=""
      className="bg-ink inline-flex max-w-[18rem] items-center gap-1 rounded-full pr-1 text-xs text-white"
    >
      <button
        type="button"
        aria-pressed
        aria-label={`Stop sharing to ${pool.name}`}
        onClick={() => onTurn(null)}
        className="inline-flex min-w-0 items-center gap-1 py-1 pl-2.5"
      >
        {face}
        <span className="truncate">{pool.name}</span>
      </button>
      <CategoryChip
        icon={lane.icon}
        name={lane.name}
        selected
        onInk
        data-share-lane={lane.id}
        aria-haspopup="dialog"
        aria-expanded={choosing}
        aria-label={`Category in ${pool.name}: ${lane.name}. Change it`}
        onSelect={onChoose}
        trailing={<ChevronDown aria-hidden size={12} className="-mr-0.5 opacity-80" />}
        className="min-w-0"
      />
    </span>
  );
}

/**
 * Where a record from Home goes, said while it is written (H75, revising
 * H45(b)): a toggle chip per pool I am in, every one off, so *Only you can
 * see this* reads under the row until one is turned on. A pool turned on is
 * on a lane at once — sharing never waits on a lane. Selection is the ink
 * fill (H20f). The post sheet's row; the draft card says it in one summary
 * row that opens a picker (`DraftShare`, H80).
 */
export function ShareToRow({ pools, shared, startLane, onTurn, onPick }: ShareProps) {
  // The pool whose lanes are open, to change its lane.
  const [choosing, setChoosing] = useState<string | null>(null);
  const photos = useStripPools();
  if (pools.length === 0) return null;
  const open = pools.find((p) => p.id === choosing && laneOf(shared, p.id));
  return (
    <div data-share-to className="relative flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-pool-500 text-xs">Share to</span>
        {pools.map((pool) => (
          <SharePoolChip
            key={pool.id}
            pool={pool}
            laneId={laneOf(shared, pool.id)}
            start={startLane(pool.id)}
            photo={photos.find((p) => p.id === pool.id)?.photo ?? null}
            choosing={choosing === pool.id}
            onTurn={(poolLaneId) => {
              if (!poolLaneId) setChoosing(null);
              onTurn(pool.id, poolLaneId);
            }}
            onChoose={() => setChoosing(choosing === pool.id ? null : pool.id)}
          />
        ))}
      </div>
      {open ? (
        <ShareLanePicker
          pool={open}
          current={laneOf(shared, open.id)}
          onPick={(laneId) => onPick(open.id, laneId)}
          onClose={() => setChoosing(null)}
        />
      ) : null}
      {shared.length === 0 ? (
        <p className="text-xs">
          <span data-share-private className="text-pool-500 text-xs">
            Only you can see this
          </span>
        </p>
      ) : null}
    </div>
  );
}
