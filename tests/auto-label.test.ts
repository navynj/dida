import { describe, expect, it } from 'vitest';

import { AUTO_WEIGHTS, autoLabel } from '@/features/month-board/auto-label';

const ids = Array.from(
  { length: 4000 },
  (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
);

describe('autoLabel (H79)', () => {
  it('is stable for an id', () => {
    for (const id of ids.slice(0, 50)) expect(autoLabel(id)).toBe(autoLabel(id));
  });

  it('draws about 40% filled, 30% Outline or Glass, 30% None', () => {
    const counts: Record<string, number> = {};
    for (const id of ids) {
      const style = autoLabel(id);
      counts[style] = (counts[style] ?? 0) + 1;
    }
    const share = (...styles: string[]): number =>
      styles.reduce((sum, s) => sum + (counts[s] ?? 0), 0) / ids.length;
    expect(share('white', 'second')).toBeGreaterThan(0.35);
    expect(share('white', 'second')).toBeLessThan(0.45);
    expect(share('outline', 'glass')).toBeGreaterThan(0.25);
    expect(share('outline', 'glass')).toBeLessThan(0.35);
    expect(share('none')).toBeGreaterThan(0.25);
    expect(share('none')).toBeLessThan(0.35);
    // Every candidate is reachable.
    for (const [style] of AUTO_WEIGHTS) expect(counts[style]).toBeGreaterThan(0);
  });

  it('never repeats the style just above it on the day', () => {
    for (const id of ids.slice(0, 500)) {
      const drawn = autoLabel(id);
      const stepped = autoLabel(id, drawn);
      expect(stepped).not.toBe(drawn);
      // The step is the next candidate in the ring.
      const at = AUTO_WEIGHTS.findIndex(([s]) => s === drawn);
      expect(stepped).toBe(AUTO_WEIGHTS[(at + 1) % AUTO_WEIGHTS.length][0]);
    }
  });

  it('keeps its draw when the neighbour differs', () => {
    const id = ids[7];
    const drawn = autoLabel(id);
    const other = AUTO_WEIGHTS.find(([s]) => s !== drawn)![0];
    expect(autoLabel(id, other)).toBe(drawn);
  });
});
