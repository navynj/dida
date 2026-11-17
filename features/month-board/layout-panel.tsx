'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

import { ControlToneProvider } from './control-tone';
import { LayoutControls, type LayoutControlsProps } from './layout-controls';

/** Between the toolbar and the popover, and the popover and the screen's edge. */
const GAP_PX = 8;
const EDGE_PX = 12;
const WIDTH_PX = 320;
/** What a tap may land on and leave the popover open. */
const KEEPS_OPEN =
  '[data-edit-toolbar], [data-edit-frame], [data-edit-handle], [data-edit-overlay], [data-edit-ghost]';
/** Below this much room on its side, it opens on the other side when that has more. */
const LEAST_PX = 260;

type Seat = { left: number; top: number; maxHeight: number; side: 'below' | 'above' };

/**
 * The Layout popover (review, desktop): the edit toolbar's More opens it,
 * anchored to the toolbar as part of it — the toolbar's white card, radius
 * and shadow — on the side away from the selected piece, flipped when that
 * side has no room, scrolling within itself when taller than the room. It
 * holds the same controls the phone's More sheet does, for the toolbar's
 * tab: All every section, Label or Icon only Position and that part's. A
 * slider moves the board at once, and a handle dragged moves the slider;
 * the drafts save themselves when it rests. More again, a tap outside,
 * Escape or its Done close it.
 */
export function LayoutPopover({
  view = 'calendar',
  onClose,
  ...controls
}: LayoutControlsProps & {
  /** Which view it edits (0045): its title says so, "Layout · Category". */
  view?: 'calendar' | 'lane' | 'members';
  onClose: () => void;
}) {
  const box = useRef<HTMLElement>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const id = controls.card.splash.id;

  const place = useCallback((): void => {
    const bar = document.querySelector('[data-edit-toolbar]')?.getBoundingClientRect();
    if (!bar) return;
    const piece = document
      .querySelector(`[data-board-piece="${id}"], [data-board-tape="${id}"]`)
      ?.getBoundingClientRect();
    const below = window.innerHeight - bar.bottom - GAP_PX - EDGE_PX;
    const above = bar.top - GAP_PX - EDGE_PX;
    // Away from the piece: under a toolbar that sits under it, over one over it.
    const away: Seat['side'] =
      piece && bar.top + bar.height / 2 < piece.top + piece.height / 2 ? 'above' : 'below';
    const room = away === 'below' ? below : above;
    const other = away === 'below' ? above : below;
    const side: Seat['side'] =
      room < LEAST_PX && other > room ? (away === 'below' ? 'above' : 'below') : away;
    const maxHeight = Math.max(160, side === 'below' ? below : above);
    const width = Math.min(WIDTH_PX, window.innerWidth - EDGE_PX * 2);
    const left = Math.max(EDGE_PX, Math.min(bar.left, window.innerWidth - EDGE_PX - width));
    const top = side === 'below' ? bar.bottom + GAP_PX : bar.top - GAP_PX;
    setSeat((was) =>
      was &&
      was.left === left &&
      was.top === top &&
      was.maxHeight === maxHeight &&
      was.side === side
        ? was
        : { left, top, maxHeight, side },
    );
  }, [id]);

  // Placed before it is painted, and again as the board scrolls, the
  // window resizes or the toolbar changes size with its tab.
  useLayoutEffect(() => {
    // Read once the toolbar is drawn: hidden until then, never out of place.
    const first = requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const bar = document.querySelector('[data-edit-toolbar]');
    const watch =
      typeof ResizeObserver === 'undefined' || !bar ? null : new ResizeObserver(() => place());
    if (bar) watch?.observe(bar);
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      watch?.disconnect();
    };
  }, [place]);

  // A tap outside it and outside the toolbar (whose tabs it follows, and
  // whose More toggles it) closes it; Escape closes it before the editing.
  useEffect(() => {
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (box.current?.contains(target)) return;
      // The toolbar, and the selected part's own frame and handles: a drag
      // there moves the sliders with it, the panel kept open to show it.
      if (target?.closest?.(KEEPS_OPEN)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <section
      ref={box}
      role="dialog"
      aria-label={layoutTitle(view)}
      data-layout-panel={id}
      data-layout-side={seat?.side}
      // The edit toolbar's card (board-handles): white with ink in every mode.
      className="surface text-ink fixed z-40 flex flex-col rounded-[20px] bg-white shadow-md"
      style={
        seat
          ? {
              left: seat.left,
              top: seat.top,
              width: Math.min(WIDTH_PX, window.innerWidth - EDGE_PX * 2),
              maxHeight: seat.maxHeight,
              transform: seat.side === 'above' ? 'translateY(-100%)' : undefined,
            }
          : { visibility: 'hidden' }
      }
    >
      <header className="flex shrink-0 items-center gap-1 py-1 pr-1 pl-4">
        <h2 className="flex-1 text-xs font-semibold">{layoutTitle(view)}</h2>
        <button
          type="button"
          data-layout-done
          onClick={onClose}
          className="text-main-900 flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
        >
          <Check aria-hidden size={14} />
          Done
        </button>
      </header>
      <div
        data-layout-body
        className="no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4"
      >
        <ControlToneProvider value="card">
          <LayoutControls {...controls} />
        </ControlToneProvider>
      </div>
    </section>,
    document.body,
  );
}

/** "Layout · Calendar", "Layout · Category", "Layout · Members". */
export function layoutTitle(view: 'calendar' | 'lane' | 'members'): string {
  return view === 'lane'
    ? 'Layout · Category'
    : view === 'members'
      ? 'Layout · Members'
      : 'Layout · Calendar';
}
