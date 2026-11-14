'use client';

import type { Card } from '@/features/home/grid';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import type { PoolScope } from '@/features/pool/compose-scope';
import type { SplashSummary } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';
import type { PendingDrop } from '@/features/input-sheet/sheet-provider';

import { ComposerFields } from './composer-fields';
import { SheetFooter } from './sheet-frame';
import { useComposer } from './use-composer';

export type SheetContext = {
  categories: MyCategory[];
  timeZone: string;
  today: IsoDate;
  /** The pools I am in now, with their lanes, for the Audience sheet. */
  pools: AudiencePool[];
  /** My initials, for a card dropped into a pool. */
  initials: string;
};

/** A drop as the composer hands it over: the post as the screen should show it, and the action that makes it true. */
export type DropHandoff = {
  splash: SplashSummary;
  month: string;
  /** The first block's words, for the recent column to preview at once. */
  note: string | null;
  /** Dropped from a pool (H23): the card that pool seats at once; the page stays there. */
  pool?: { poolId: string; card: Card };
  /** Dropped from a pool: where Home seats it before the server has it (0033). */
  home?: PendingDrop['home'];
  /** `landed`: refused past the splash itself — it exists, only a later step failed. */
  commit: () => Promise<{ ok: true } | { ok: false; message: string; landed?: true }>;
};

/**
 * The post sheet's composer (SPEC 6, H21, H75): the fields (`ComposerFields`)
 * and one full-width Drop. Dormant since the draft card (H80) took the
 * compose disc; kept with its tests, per the dormant-not-deleted rule.
 *
 * Drop hands over at once (CLAUDE.md, the principle): the post as the
 * ground should show it, its month, and the action that makes it real. The
 * fields clear the moment it is handed over.
 */
export function SplashComposer({
  context,
  onDrop,
  autoFocus = true,
  pool = null,
}: {
  context: SheetContext;
  onDrop: (drop: DropHandoff) => void;
  autoFocus?: boolean;
  /** Composing from a pool (H23): its lanes are the picker, and it is the default audience. */
  pool?: PoolScope | null;
}) {
  const composer = useComposer({ context, pool });
  return (
    <ComposerFields
      composer={composer}
      pools={context.pools}
      today={context.today}
      autoFocus={autoFocus}
      footer={
        // Blue means action: the one filled thing here commits (H20f).
        // Pinned to the sheet's bottom, in reach above the keyboard.
        <SheetFooter>
          <button
            type="button"
            disabled={!composer.canCommit}
            onClick={() => {
              onDrop(composer.handoff(crypto.randomUUID()));
              composer.reset();
            }}
            className="bg-main-900 w-full rounded-full py-2.5 text-xl font-medium text-white disabled:opacity-50"
          >
            Drop
          </button>
        </SheetFooter>
      }
    />
  );
}
