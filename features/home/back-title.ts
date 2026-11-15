import type { ThemeColor, ThemeMode } from '@/lib/theme';
import { THEMES } from '@/lib/theme';

/** Body text: what a title darkens toward where its step is too dark for it. */
export const INK = '#161621';
/** 4.5:1 for small text, with a rounding margin (H78y's 4.6). */
export const TITLE_CONTRAST = 4.6;

/**
 * A back card's title before any step darkens it (H78y), per theme: light
 * mode's `--back-title` where it is set, pastel's `--pastel-back-title`
 * (globals.css; `tests/back-title.test.ts` keeps the two in step). The dark
 * ground's is the theme colour itself.
 */
const LIGHT: Partial<Record<ThemeColor, string>> = {
  red: '#cb1a0f',
  orange: '#b54303',
  yellow: '#8e6303',
  green: '#007843',
  lime: '#3f7702',
  sky: '#026da9',
  mint: '#077570',
  pink: '#c80175',
};
const PASTEL: Record<ThemeColor, string> = {
  red: '#ab4541',
  orange: '#955b05',
  yellow: '#876602',
  green: '#027843',
  lime: '#517401',
  sky: '#046fa2',
  mint: '#047476',
  blue: '#475bae',
  purple: '#6e56b2',
  pink: '#994b8c',
  brown: '#7e6248',
  black: '#616161',
};

export function backTitleBase(color: ThemeColor, mode: ThemeMode): string {
  const hex = (THEMES.find((t) => t.key === color) ?? THEMES[0]).hex.toLowerCase();
  if (mode === 'pastel') return PASTEL[color];
  if (mode === 'light') return LIGHT[color] ?? hex;
  return hex;
}

type Rgb = [number, number, number];

function rgbOf(colour: string): Rgb {
  if (colour.startsWith('rgb')) return colour.match(/\d+/g)!.slice(0, 3).map(Number) as Rgb;
  return [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast of two colours, `#rrggbb` or `rgb(…)`. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  a.map((c, i) => Math.round(c + (b[i] - c) * t)) as Rgb;
const hexOf = (c: Rgb): string => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * A back card's title on its step (H82): the theme's title as it is where
 * it already reads at 4.6:1 on the step's fill, else mixed toward ink by
 * the least that does. The fill moves with the card, so the title follows
 * it continuously and a flip never makes it jump; the steps stay as drawn.
 */
export function edgeTitle(title: string, fill: string): string {
  const base = rgbOf(title);
  const ink = rgbOf(INK);
  if (contrast(title, fill) >= TITLE_CONTRAST) return hexOf(base);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i += 1) {
    const at = (lo + hi) / 2;
    if (contrast(hexOf(mix(base, ink, at)), fill) >= TITLE_CONTRAST) hi = at;
    else lo = at;
  }
  return hexOf(mix(base, ink, hi));
}
