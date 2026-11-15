'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Card, GridColumn } from '@/features/home/grid';
import type { PoolScope } from '@/features/pool/compose-scope';
import type { SplashSummary } from '@/features/splash/summary';
import type { ComposerSnapshot } from '@/features/splash-sheet/use-composer';

/**
 * The one composer sheet (SPEC 6, H80): on a phone, compose from anywhere —
 * Home, a pool, a lane's page, the diary list — opens the page sheet with
 * the draft card's fields; on a wide screen the stack writes a draft card
 * in place, and only a screen with no stack opens the sheet. Every later
 * word is written on the post's page.
 *
 * The provider also carries the post just dropped — optimistically, before
 * the server has it (CLAUDE.md, the principle) — so the ground can seat its
 * pill at once and play the commit ripple there.
 */
export type OpenSheet =
  | {
      kind: 'splash';
      pool: PoolScope | null;
      /** The post's id, minted as the sheet opens, so the card it becomes is the same card. */
      id: string;
      /** A refused Save opened again (H80): the fields as they were, and why. */
      snapshot: ComposerSnapshot | null;
      error: string | null;
    }
  /** The same sheet in edit mode (review): a splash's title, icon, dates, lane, audience. */
  | { kind: 'edit'; splashId: string; pool?: PoolScope | null }
  | null;

/** A splash edited a moment ago, as every surface should show it until the re-read lands. */
export type PendingEdit = {
  title: string;
  icon: string | null;
  declaredLaneId?: string | null;
  /** A pool's own splash moved to another of its pool's lanes (0020). */
  poolLane?: { id: string; icon: string | null; name: string };
  /** Converted (0022): what it is now — my own, Just mine, or the pool's. */
  kind?: 'mine' | 'own' | 'joint';
  /**
   * Filed on Home (H45): the column its mark moves to — a lane of mine, or
   * back to its pool's — and the lane it names there (none: my lane's own).
   */
  homeColumn?: { column: string; lane: { icon: string | null; name: string } | null };
};

/**
 * `pool`: dropped from a pool (H23) — the card as that pool's grid should
 * show it, so the pool seats it before the server has it, as Home does.
 */
export type PendingDrop = {
  splash: SplashSummary;
  month: string;
  note: string | null;
  pool?: { poolId: string; card: Card };
  /**
   * Dropped from a pool, as Home should seat it before the server has it
   * (review): its column and the emoji it falls back to, and the pool's
   * column when Home has none yet.
   */
  home?: { card: Partial<Card>; column?: GridColumn };
};

type SheetApi = {
  sheet: OpenSheet;
  /** From a pool, with that pool as the default (H23); from Home, with none. */
  openSheet: (pool?: PoolScope | null) => void;
  /**
   * A refused Save (H80): the sheet opens again with its fields and photos
   * and says why — unless another has been opened since, which is left be.
   */
  reopenSheet: (again: Extract<OpenSheet, { kind: 'splash' }>) => void;
  /** The pencil on a card or a splash's page: the sheet in edit mode. */
  /** From a pool screen, with that pool (0022): its lanes and Together; from Home, none. */
  openEdit: (splashId: string, pool?: PoolScope | null) => void;
  pendingEdits: Record<string, PendingEdit>;
  markEdited: (splashId: string, edit: PendingEdit) => void;
  clearEdited: (splashId: string) => void;
  closeSheet: () => void;
  /** The post just dropped, until the ground has read it back. */
  pendingDrop: PendingDrop | null;
  markDropped: (drop: PendingDrop) => void;
  clearDropped: () => void;
  /** Posts deleted a moment ago, gone from every surface before the re-read lands. */
  pendingDeletes: string[];
  markDeleted: (splashId: string) => void;
  /** What the server said when a drop was refused, for the ground to show. */
  dropMessage: string | null;
  dropFailed: (message: string) => void;
};

const Context = createContext<SheetApi | null>(null);

export function InputSheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const markDeleted = useCallback(
    (splashId: string) => setPendingDeletes((current) => [...current, splashId]),
    [],
  );

  const openSheet = useCallback(
    (pool: PoolScope | null = null) =>
      setSheet({ kind: 'splash', pool, id: crypto.randomUUID(), snapshot: null, error: null }),
    [],
  );
  const reopenSheet = useCallback(
    (again: Extract<OpenSheet, { kind: 'splash' }>) => setSheet((current) => current ?? again),
    [],
  );
  const closeSheet = useCallback(() => setSheet(null), []);
  const openEdit = useCallback(
    (splashId: string, pool: PoolScope | null = null) => setSheet({ kind: 'edit', splashId, pool }),
    [],
  );
  const [pendingEdits, setPendingEdits] = useState<Record<string, PendingEdit>>({});
  const markEdited = useCallback(
    (splashId: string, edit: PendingEdit) =>
      setPendingEdits((current) => ({ ...current, [splashId]: edit })),
    [],
  );
  const clearEdited = useCallback(
    (splashId: string) =>
      setPendingEdits((current) => {
        const rest = { ...current };
        delete rest[splashId];
        return rest;
      }),
    [],
  );
  const markDropped = useCallback((drop: PendingDrop) => {
    setDropMessage(null);
    setPendingDrop(drop);
  }, []);
  const clearDropped = useCallback(() => setPendingDrop(null), []);
  const dropFailed = useCallback((message: string) => {
    setPendingDrop(null);
    setDropMessage(message);
  }, []);

  const value = useMemo(
    () => ({
      sheet,
      openSheet,
      reopenSheet,
      closeSheet,
      openEdit,
      pendingEdits,
      markEdited,
      clearEdited,
      pendingDrop,
      markDropped,
      clearDropped,
      dropMessage,
      dropFailed,
      pendingDeletes,
      markDeleted,
    }),
    [
      sheet,
      openSheet,
      reopenSheet,
      closeSheet,
      openEdit,
      pendingEdits,
      markEdited,
      clearEdited,
      pendingDrop,
      markDropped,
      clearDropped,
      dropMessage,
      dropFailed,
      pendingDeletes,
      markDeleted,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInputSheet(): SheetApi {
  const api = useContext(Context);
  if (!api) throw new Error('useInputSheet must be used inside InputSheetProvider');
  return api;
}
