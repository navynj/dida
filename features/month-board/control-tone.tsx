'use client';

import { createContext, useContext } from 'react';

/**
 * Where the layout controls are drawn: on the water (a phone's More sheet,
 * white words on the ground's colour) or on the edit toolbar's white card
 * (a desktop's popover, ink words, `surface` so it stays white with ink in
 * every mode). One set of controls, two inks.
 */
export type ControlTone = 'water' | 'card';

const TONES = {
  water: {
    heading: 'text-white',
    name: 'text-white/80',
    value: 'text-white',
    auto: 'text-white/50',
    reset: 'text-white/70',
    soft: 'bg-white/15',
    softer: 'bg-white/20 text-white',
    strong: 'bg-white/30 text-white',
    dashed: 'border-white/50',
    switchOn: 'bg-white',
    knobOn: 'bg-main-900',
    switchOff: 'bg-white/25',
    knobOff: 'bg-white',
    note: 'text-white/60',
    photo: 'bg-white/20',
    range: 'layout-range',
  },
  card: {
    heading: 'text-ink',
    name: 'text-pool-500',
    value: 'text-ink',
    auto: 'text-pool-500',
    reset: 'text-pool-500',
    soft: 'bg-pool-100 text-ink',
    softer: 'bg-pool-100 text-ink',
    strong: 'bg-pool-100 text-ink',
    dashed: 'border-pool-200',
    // Selection is ink, as the toolbar's own Icon inline switch (H20f).
    switchOn: 'bg-ink',
    knobOn: 'bg-white',
    switchOff: 'bg-pool-200',
    knobOff: 'bg-white',
    note: 'text-pool-500',
    photo: 'bg-pool-100',
    range: 'layout-range layout-range-card',
  },
} as const;

export type ToneClasses = (typeof TONES)[ControlTone];

const ToneContext = createContext<ControlTone>('water');

export const ControlToneProvider = ToneContext.Provider;

/** The classes for the tone the controls are drawn in. */
export function useTone(): ToneClasses {
  return TONES[useContext(ToneContext)];
}
