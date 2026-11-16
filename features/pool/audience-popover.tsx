'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import { Monogram } from '@/components/ui/monogram';
import { PickerSearch } from '@/features/input-sheet/lane-chips';

import { useStripPools } from './activity';
import {
  AUDIENCE_HELP,
  AudienceHead,
  AudienceRows,
  type AudienceRowsProps,
} from './audience-sheet';
import type { MoveHome } from './move-to-home';

/** Past this many diaries a search field heads the popover, as the category picker's (H80). */
export const AUDIENCE_SEARCH_PAST = 6;

/**
 * Audience on a wide screen (H75, wide): a popover anchored to the control
 * that opened it, right-aligned to it, inside the panel — no dimmed screen,
 * no sheet rising from the other half. The helper line, then a row per
 * diary: its monogram or photo, its name, its lane chips once on (H75), and
 * the switch; a search over them past six. Changes apply at once; a click
 * outside or Escape closes it and gives focus back to the control. Tab
 * walks the rows, Space toggles a switch.
 *
 * The one Audience picker on a wide screen: a record's chip, the edit
 * sheet's, and the draft card's *+N* in Share to.
 */
export function AudiencePopover({
  trigger,
  onClose,
  moveHome = null,
  side = 'below',
  align = 'right',
  ...rows
}: AudienceRowsProps & {
  /** The control it hangs from: outside it, a click closes; closed, focus goes back to it. */
  trigger: RefObject<HTMLElement | null>;
  onClose: () => void;
  moveHome?: MoveHome | null;
  /** Under its control, or over it where the control sits at a card's foot. */
  side?: 'below' | 'above';
  align?: 'left' | 'right';
}) {
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const photos = useStripPools();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    // In it from the start, so Tab reaches the first row; no ring (H78n).
    box.current?.focus({ preventScroll: true });
    const close = (): void => {
      closeRef.current();
      trigger.current?.focus({ preventScroll: true });
    };
    const down = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (box.current?.contains(target) || trigger.current?.contains(target)) return;
      close();
    };
    // Captured first, so it is the popover's alone: not the card's, not the sheet's.
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.stopPropagation();
      event.preventDefault();
      close();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [trigger]);

  const needle = query.trim().toLowerCase();
  const searchable = rows.pools.length > AUDIENCE_SEARCH_PAST;
  const shown = searchable
    ? rows.pools.filter((p) => p.name.toLowerCase().includes(needle))
    : rows.pools;

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Audience"
      tabIndex={-1}
      data-audience-popover
      // The category picker's popover (H80): white, the soft shadow, no
      // border; its own scroll past its height.
      className={`picker-surface absolute z-40 flex max-h-[min(28rem,70vh)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto overscroll-contain rounded-xl bg-white px-4 pt-3 pb-1 text-left text-sm shadow-lg outline-none ${
        side === 'below' ? 'top-full mt-2' : 'bottom-full mb-2'
      } ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      <AudienceHead
        title={<p className="text-pool-500 pb-1 text-xs">{AUDIENCE_HELP}</p>}
        moveHome={moveHome}
      />
      {searchable ? (
        <div className="pt-2">
          <PickerSearch value={query} onChange={setQuery} placeholder="Search diaries" pill />
        </div>
      ) : null}
      <AudienceRows
        {...rows}
        pools={shown}
        named="name"
        empty={searchable && rows.pools.length > 0 ? 'No diary matches' : undefined}
        face={(pool) => (
          <Monogram
            name={pool.name}
            size="head"
            photo={photos.find((p) => p.id === pool.id)?.photo ?? null}
          />
        )}
      />
    </div>
  );
}
