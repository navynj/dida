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

/** Pastel's words (`--pastel-text`, H78t), the read card's label there. */
const PASTEL_TEXT: Record<ThemeColor, string> = {
  red: '#b64f4a',
  orange: '#9f6205',
  yellow: '#8c6b06',
  green: '#068149',
  lime: '#577b10',
  sky: '#0271a5',
  mint: '#017b7d',
  blue: '#5369bd',
  purple: '#775fbc',
  pink: '#a25395',
  brown: '#84684e',
  black: '#6e6e6e',
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
  return toward(title, fill, INK);
}

/** `start` as it is where it reads at 4.6:1 on `fill`, else mixed toward `target` by the least that does. */
function toward(start: string, fill: string, target: string): string {
  const base = rgbOf(start);
  const end = rgbOf(target);
  if (contrast(start, fill) >= TITLE_CONTRAST) return hexOf(base);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i += 1) {
    const at = (lo + hi) / 2;
    if (contrast(hexOf(mix(base, end, at)), fill) >= TITLE_CONTRAST) hi = at;
    else lo = at;
  }
  return hexOf(mix(base, end, hi));
}

/** The read card's glass: white at this much over the ground (H22 review). */
export const UP_GLASS = 0.2;
/** The read card's label is drawn at this much over its glass, before any fix (H82). */
export const UP_LABEL = 0.6;

/**
 * The most ink the dark ground's glass takes for a white label (H82,
 * Yoonji). Past it the glass goes muddy (Yellow needed 33%), so it stays
 * unsmoked and the label turns toward ink instead.
 */
export const SMOKE_LIMIT = 0.25;

/**
 * The ink a white label would need in the dark ground's glass (white at 20%
 * over the water) to read at 4.6:1: the least that does, 0 where white
 * already does (Blue, Black).
 */
export function smokeNeeded(theme: string): number {
  const glass = mix(rgbOf(theme), [255, 255, 255], UP_GLASS);
  const ink = rgbOf(INK);
  if (contrast('#ffffff', hexOf(glass)) >= TITLE_CONTRAST) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i += 1) {
    const at = (lo + hi) / 2;
    if (contrast('#ffffff', hexOf(mix(glass, ink, at))) >= TITLE_CONTRAST) hi = at;
    else lo = at;
  }
  return hi;
}

/**
 * The read card's glass on the dark ground (H82): smoked by `smokeNeeded`
 * up to SMOKE_LIMIT; past it, not at all — the label goes dark instead
 * (`upWords`). Light and pastel grounds keep their white glass.
 */
export function glassSmoke(theme: string): number {
  const need = smokeNeeded(theme);
  return need <= SMOKE_LIMIT ? need : 0;
}

/**
 * What the read card's label moves toward where it does not read (H82): the
 * ground's words — white on the dark ground, where the glass can be smoked
 * for it within SMOKE_LIMIT; ink otherwise (light, pastel, and a dark
 * ground whose glass would go past it: Yellow).
 */
export function upWords(theme: string, mode: ThemeMode): string {
  return mode === 'dark' && smokeNeeded(theme) <= SMOKE_LIMIT ? '#ffffff' : INK;
}

/** What the read card's glass reads as, over the water: the solid it falls back to. */
export function glassFill(theme: string, mode: ThemeMode): string {
  if (mode !== 'dark') return '#ffffff';
  const glass = mix(rgbOf(theme), [255, 255, 255], UP_GLASS);
  return hexOf(mix(glass, rgbOf(INK), glassSmoke(theme)));
}

/** The read card's label before any fix: white on the dark ground, the accent on light, pastel's words on pastel. */
export function upLabelBase(color: ThemeColor, mode: ThemeMode): string {
  if (mode === 'dark') return '#ffffff';
  if (mode === 'pastel') return PASTEL_TEXT[color];
  return (THEMES.find((t) => t.key === color) ?? THEMES[0]).hex.toLowerCase();
}

/**
 * The read card's label on its fill (H82): the label at `alpha` over the
 * fill, as it was drawn, kept where it reads at 4.6:1, else moved toward
 * `target` (`upWords`) by the least that does. Returned opaque, so the
 * words carry no alpha of their own.
 */
export function upTitle(label: string, fill: string, alpha: number, target: string): string {
  const drawn = hexOf(mix(rgbOf(fill), rgbOf(label), alpha));
  return toward(drawn, fill, target);
}
