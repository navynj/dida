import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  backTitleBase,
  contrast,
  edgeTitle,
  INK,
  TITLE_CONTRAST,
} from '@/features/home/back-title';
import { TINT_STEP } from '@/features/home/card-face';
import { face } from '@/features/home/card-face';
import { LIGHT_TINTS } from '@/features/home/stair-board';
import { THEMES, type ThemeMode } from '@/lib/theme';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

function cssVar(theme: string, name: string): string | undefined {
  // A theme may have more than one rule; read them all.
  const block = [...css.matchAll(new RegExp(`\\[data-theme='${theme}'\\] \\{([^}]*)\\}`, 'g'))]
    .map((m) => m[1])
    .join('\n');
  return block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i'))?.[1].toLowerCase();
}

/** The steps a back card's title sits on, per ground (H82; dark keeps H78v's 8%). */
const STEPS: Record<ThemeMode, readonly number[]> = {
  light: LIGHT_TINTS.slice(1),
  pastel: LIGHT_TINTS.slice(1),
  dark: [TINT_STEP, TINT_STEP * 2, TINT_STEP * 3],
};

describe('a back card’s title on the stack (H82)', () => {
  it('starts from the title globals.css sets for each theme', () => {
    for (const t of THEMES) {
      const hex = t.hex.toLowerCase();
      expect(backTitleBase(t.key, 'light'), t.key).toBe(cssVar(t.key, 'back-title') ?? hex);
      expect(backTitleBase(t.key, 'pastel'), t.key).toBe(cssVar(t.key, 'pastel-back-title'));
      expect(backTitleBase(t.key, 'dark'), t.key).toBe(hex);
    }
  });

  it('reads at 4.5:1 on every step, every theme, every ground', () => {
    for (const t of THEMES) {
      for (const mode of ['light', 'pastel', 'dark'] as const) {
        const base = backTitleBase(t.key, mode);
        for (const tint of STEPS[mode]) {
          const fill = face(tint, t.hex);
          const title = edgeTitle(base, fill);
          expect(contrast(title, fill), `${t.key} ${mode} ${tint}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('keeps the theme’s own title where the step already passes', () => {
    // Blue on light passes even at 28%; its title is the accent untouched.
    expect(edgeTitle('#0507c9', face(0.28, '#0507C9'))).toBe('#0507c9');
  });

  it('darkens toward ink by the least that passes, never past it', () => {
    const fill = face(0.28, '#C08600');
    const title = edgeTitle('#8e6303', fill);
    expect(contrast(title, fill)).toBeGreaterThanOrEqual(TITLE_CONTRAST);
    expect(contrast(title, fill)).toBeLessThan(TITLE_CONTRAST + 0.1);
    expect(contrast(INK, fill)).toBeGreaterThan(contrast(title, fill));
  });

  it('follows the fill continuously, so a card moving between steps never jumps', () => {
    const base = backTitleBase('yellow', 'dark');
    let last = edgeTitle(base, face(TINT_STEP, '#C08600'));
    for (let tint = TINT_STEP; tint <= TINT_STEP * 3; tint += 0.005) {
      const now = edgeTitle(base, face(tint, '#C08600'));
      const gap = [1, 3, 5].map((k) =>
        Math.abs(parseInt(now.slice(k, k + 2), 16) - parseInt(last.slice(k, k + 2), 16)),
      );
      expect(Math.max(...gap)).toBeLessThanOrEqual(4);
      last = now;
    }
  });
});
