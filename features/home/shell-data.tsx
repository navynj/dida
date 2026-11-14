'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { SheetContext } from '@/features/splash-sheet/splash-composer';
import type { MyCategory } from '@/lib/queries/profile';

/**
 * What the shell read once for every page (0059): my lanes, for the
 * settings sheet's tabs to open from at once, with nothing to fetch; and
 * what the composer needs, for the draft card on a stack (H80).
 */
type ShellData = { categories: MyCategory[]; compose?: SheetContext | null };

const Context = createContext<ShellData>({ categories: [] });

export function ShellDataProvider({ value, children }: { value: ShellData; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useShellData(): ShellData {
  return useContext(Context);
}
