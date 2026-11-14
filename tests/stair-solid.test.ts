import { describe, expect, it } from 'vitest';

import { LIGHT_TINTS, seat, upSolid, type Stair } from '@/features/home/stair-board';

/**
 * The read card's solid (review): what frosted glass reads as, so a card
 * moving to or from the top never turns a colour the glass then drops.
 */
const STAIR: Stair = { horizontal: false, width: 360, height: 400, left: 0, down: 3, up: 1 };

describe('upSolid', () => {
  it('is 20% white into the theme colour on the dark ground, #3739D4 for blue', () => {
    expect(upSolid('#0507C9', 'dark')).toBe('rgb(55, 57, 212)');
  });

  it('is white on the light and pastel grounds, where the glass is white over white', () => {
    expect(upSolid('#0507C9', 'light')).toBe('#FFFFFF');
    expect(upSolid('#E5318C', 'pastel')).toBe('#FFFFFF');
  });
});

describe('a card moving between the top and the read step without glass', () => {
  it('stays white the whole way on the light ground: no dark flash', () => {
    for (const d of [0, -0.25, -0.5, -0.75, -1]) {
      expect(seat(d, STAIR, false, '#0507C9', upSolid('#0507C9', 'light')).background).toBe(
        'rgb(255, 255, 255)',
      );
    }
  });

  it('deepens into the dark ground’s glass in dark mode', () => {
    expect(seat(-1, STAIR, false, '#0507C9', upSolid('#0507C9', 'dark')).background).toBe(
      'rgb(55, 57, 212)',
    );
  });
});

describe('the top card and the back cards on the light ground (H82)', () => {
  const fill = (d: number): string =>
    seat(d, STAIR, false, '#161621', upSolid('#161621', 'light'), LIGHT_TINTS).background;
  it('fills the top with 3% of the theme colour and steps 12%, 20% and 28% below it', () => {
    expect(fill(0)).toBe('rgb(248, 248, 248)');
    expect(fill(1)).toBe('rgb(227, 227, 228)');
    expect(fill(2)).toBe('rgb(208, 208, 211)');
    expect(fill(3)).toBe('rgb(190, 190, 193)');
  });
  it('lands a card coming down from the read step on the top’s own fill, with no jump', () => {
    expect(fill(-0.001)).toBe(fill(0));
  });
});
