import { seedOf } from './layout-seed';

/** The styles Auto draws from (revises H37/H55's rule): never `ink`, `pale`, which are a choice or a side's. */
export type AutoLabel = 'white' | 'second' | 'outline' | 'glass' | 'none';

/**
 * Auto's weights out of 100, in candidate order (H79): about 40% filled —
 * the theme colour and the rule's second fill, drawn per ground as H55 does —
 * 30% Outline or Glass and 30% None. The order is also the ring a same-day
 * neighbour steps along, so a step from a fill lands on a lighter face.
 */
export const AUTO_WEIGHTS: readonly (readonly [AutoLabel, number])[] = [
  ['white', 25],
  ['outline', 15],
  ['none', 30],
  ['second', 15],
  ['glass', 15],
];

const TOTAL = AUTO_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

/**
 * The style Auto gives a record (H79): read off a stable hash of its id —
 * the same on every render and device, as the photo tilts are — and stepped
 * to the next candidate when the record just above it on the same day drew
 * the same style, so a day never shows two alike in a row.
 */
export function autoLabel(id: string, above: string | null = null): AutoLabel {
  const roll = seedOf(`auto-label:${id}`) % TOTAL;
  let at = 0;
  let acc = 0;
  for (; at < AUTO_WEIGHTS.length; at += 1) {
    acc += AUTO_WEIGHTS[at][1];
    if (roll < acc) break;
  }
  const drawn = AUTO_WEIGHTS[at][0];
  if (drawn !== above) return drawn;
  return AUTO_WEIGHTS[(at + 1) % AUTO_WEIGHTS.length][0];
}
