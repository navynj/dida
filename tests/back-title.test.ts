import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  backTitleBase,
  contrast,
  edgeTitle,
  glassFill,
  glassSmoke,
  INK,
  TITLE_CONTRAST,
  UP_LABEL,
  upLabelBase,
  upTitle,
  upWords,
  SMOKE_LIMIT,
  smokeNeeded,
} from '@/features/home/back-title';
import { seat, upSolid, type Stair } from '@/features/home/stair-board';
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

const STAIR: Stair = { horizontal: false, width: 360, height: 400, left: 0, down: 3, up: 1 };
const MODES = ['light', 'pastel', 'dark'] as const;

describe('the read card’s label on its glass (H82)', () => {
  it('starts from the words globals.css sets: white on dark, the accent on light, pastel’s words', () => {
    for (const t of THEMES) {
      expect(upLabelBase(t.key, 'dark')).toBe('#ffffff');
      expect(upLabelBase(t.key, 'light')).toBe(t.hex.toLowerCase());
      expect(upLabelBase(t.key, 'pastel'), t.key).toBe(cssVar(t.key, 'pastel-text'));
    }
  });

  it('reads at 4.5:1 at rest on the glass and on the solid, every theme, every ground', () => {
    for (const t of THEMES) {
      for (const mode of MODES) {
        const solid = upSolid(t.hex, mode);
        const glass = mode === 'dark' ? { ground: t.hex, smoke: glassSmoke(t.hex) } : undefined;
        for (const frost of [true, false]) {
          const at = seat(-1, STAIR, frost, t.hex, solid, undefined, glass);
          const label = upTitle(upLabelBase(t.key, mode), at.fill, at.ink, upWords(t.hex, mode));
          expect(
            contrast(label, at.fill),
            `${t.key} ${mode} ${frost ? 'glass' : 'solid'}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('stays white on the dark ground where the glass can be smoked for it within the limit', () => {
    for (const t of THEMES) {
      if (smokeNeeded(t.hex) > SMOKE_LIMIT) continue;
      const fill = glassFill(t.hex, 'dark');
      // White over its glass, at the least opacity that reads: every channel
      // lighter than the glass's own, never darkened toward ink.
      const label = upTitle('#ffffff', fill, UP_LABEL, upWords(t.hex, 'dark'));
      for (const k of [1, 3, 5]) {
        expect(parseInt(label.slice(k, k + 2), 16), t.key).toBeGreaterThan(
          parseInt(fill.slice(k, k + 2), 16),
        );
      }
      expect(contrast('#ffffff', fill), t.key).toBeGreaterThanOrEqual(TITLE_CONTRAST);
    }
  });

  it('smokes the glass by the least that lets white read, and not at all where it already does', () => {
    expect(glassSmoke('#0507C9')).toBe(0);
    expect(glassSmoke('#161621')).toBe(0);
    const red = glassFill('#D92D20', 'dark');
    expect(contrast('#ffffff', red)).toBeLessThan(TITLE_CONTRAST + 0.1);
  });

  it('past the limit, leaves the glass unsmoked and turns the label toward ink: Yellow alone today', () => {
    const past = THEMES.filter((t) => smokeNeeded(t.hex) > SMOKE_LIMIT).map((t) => t.key);
    expect(past).toEqual(['yellow']);
    expect(glassSmoke('#C08600')).toBe(0);
    expect(glassFill('#C08600', 'dark')).toBe('#cd9e33');
    expect(upWords('#C08600', 'dark')).toBe(INK);
    const label = upTitle('#ffffff', '#cd9e33', UP_LABEL, INK);
    expect(contrast(label, '#cd9e33')).toBeGreaterThanOrEqual(TITLE_CONTRAST);
    expect(contrast(label, '#cd9e33')).toBeLessThan(TITLE_CONTRAST + 0.1);
  });

  it('draws the glass as what the solid reads as, so a card that starts or stops moving never flickers', () => {
    for (const t of THEMES) {
      const glass = { ground: t.hex, smoke: glassSmoke(t.hex) };
      const frosted = seat(-1, STAIR, true, t.hex, upSolid(t.hex, 'dark'), undefined, glass);
      const solid = seat(-1, STAIR, false, t.hex, upSolid(t.hex, 'dark'), undefined, glass);
      const gap = [frosted.fill, solid.fill].map((c) => c.match(/\d+/g)!.map(Number));
      for (let k = 0; k < 3; k += 1) {
        expect(Math.abs(gap[0][k] - gap[1][k]), t.key).toBeLessThanOrEqual(1);
      }
    }
  });

  it('moves the light grounds’ label toward ink, never past what it needs', () => {
    const label = upTitle('#c08600', '#ffffff', UP_LABEL, upWords('#C08600', 'light'));
    expect(contrast(label, '#ffffff')).toBeGreaterThanOrEqual(TITLE_CONTRAST);
    expect(contrast(label, '#ffffff')).toBeLessThan(TITLE_CONTRAST + 0.1);
    expect(contrast(INK, '#ffffff')).toBeGreaterThan(contrast(label, '#ffffff'));
  });
});
