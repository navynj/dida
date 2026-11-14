'use client';

import type { CSSProperties } from 'react';

/**
 * The spiral binding (H81): the stack reads as a top-bound notepad. One
 * binding for the whole stack, anchored to the top card's seat — the cards
 * move through it on the stack's spring and it never moves (static, so the
 * motion rules and reduced motion are untouched).
 *
 * **Placeholder geometry**: each coil is a plain ring until the Figma
 * export exists (`_docs/mockups/coil.svg`, CLAUDE.md: never invent drawn
 * geometry). The numbers below place it; the drawing is a stand-in.
 */

/** How far a coil rises above the top card's edge: R (H81). */
export const COIL_RISE_PX = 8;
/** One coil every this many px across the card, centred. */
export const COIL_PITCH_PX = 28;
/** No coil nearer a side than this: clear of the 24px rounded corners. */
export const COIL_MARGIN_PX = 32;
/** A hole's centre below the card's top edge, and its radius. */
export const HOLE_CY_PX = 12;
export const HOLE_R_PX = 4;
/** The band the binding takes off the top of a face: the words start below it. */
export const BINDING_BAND_PX = 16;
/** The wire's weight. */
const WIRE_PX = 2;

/** Where the coils sit across a card this wide, centred, evenly spaced. */
export function coilXs(width: number): number[] {
  if (width <= 2 * COIL_MARGIN_PX) return [];
  const count = Math.floor((width - 2 * COIL_MARGIN_PX) / COIL_PITCH_PX) + 1;
  const left = (width - (count - 1) * COIL_PITCH_PX) / 2;
  return Array.from({ length: count }, (_, i) => left + i * COIL_PITCH_PX);
}

/**
 * The holes punched in a face as a mask (H81): every hole at the same
 * place on every card, so whichever card arrives on top lines up with the
 * coils, and what is behind shows through — not a painted dot. `r` is the
 * hole's radius: full on the top card, closing as a card steps away, so the
 * read card's bookmark strip above carries no holes.
 */
export function holeMask(width: number, r: number): string {
  const xs = coilXs(width);
  if (r <= 0.05 || xs.length === 0) return 'none';
  return xs
    .map(
      (x) =>
        `radial-gradient(circle ${r.toFixed(2)}px at ${x.toFixed(1)}px ${HOLE_CY_PX}px, transparent ${r.toFixed(2)}px, #000 ${(r + 0.6).toFixed(2)}px)`,
    )
    .join(', ');
}

/** Every layer kept only where all keep it: the holes are the union of each layer's one. */
export const HOLE_COMPOSITE: CSSProperties = {
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
};

/**
 * One half of the coils (H81). The **back** half runs from the top of the
 * coil down behind the card to its hole, seen only above the edge and
 * through the hole; the **front** half comes up from the hole, over the
 * edge. The two layers straddle the top card in the stack's own stacking,
 * so the wire threads it. Never a target: pointer-events none.
 */
export function Binding({ width, half, z }: { width: number; half: 'back' | 'front'; z: number }) {
  const xs = coilXs(width);
  if (xs.length === 0) return null;
  const height = COIL_RISE_PX + HOLE_CY_PX + WIRE_PX;
  const top = WIRE_PX / 2;
  const bottom = COIL_RISE_PX + HOLE_CY_PX;
  const ry = (bottom - top) / 2;
  const rx = 3.5;
  return (
    <svg
      aria-hidden
      data-binding={half}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      // The wire in the muted grey of the pool ramp: a token, swapped with the ground's mode.
      className="text-pool-500 pointer-events-none absolute left-0 overflow-visible"
      style={{ top: -COIL_RISE_PX, zIndex: z }}
    >
      {xs.map((x) => (
        <path
          key={x}
          data-coil
          // Clockwise: from the hole up the left (front), or from the top down the right (back).
          d={
            half === 'front'
              ? `M ${x} ${bottom} A ${rx} ${ry} 0 0 1 ${x} ${top}`
              : `M ${x} ${top} A ${rx} ${ry} 0 0 1 ${x} ${bottom}`
          }
          fill="none"
          stroke="currentColor"
          strokeWidth={WIRE_PX}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
