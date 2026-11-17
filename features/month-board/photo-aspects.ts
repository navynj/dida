'use client';

import { useSyncExternalStore } from 'react';

import { aspectKey, type Measured } from './layout';

/**
 * Photos are never cropped (review, 2026-10-27). A photo uploaded since
 * 0070 carries its size on its row, so its box is right before it loads
 * (`storedAspects`); an older one's ratio is learned from the image once it
 * loads (`notePhotoAspect`) and kept here for the page's life, by path;
 * until then it holds the layout's 4:3 placeholder (`photoBox`).
 */
let aspects: Record<string, number> = {};
const listeners = new Set<() => void>();

/**
 * How far a ratio may stray from the one learned and still be the same
 * photo: its copies (0070's thumb on the board, display on a shared image)
 * are resized, and rounding leaves their ratios a hair apart. Within it the
 * first ratio stands, so two copies on screen never take turns rewriting it
 * — each rewrite re-rendered every board, whose images wrote theirs back,
 * until React gave up (Maximum update depth, 2026-11-16).
 */
const SAME_PHOTO = 0.02;

export function notePhotoAspect(path: string, width: number, height: number): void {
  if (!(width > 0 && height > 0)) return;
  const ratio = width / height;
  const known = aspects[path];
  if (known !== undefined && Math.abs(known - ratio) / known < SAME_PHOTO) return;
  aspects = { ...aspects, [path]: ratio };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: Record<string, number> = {};

/** Every ratio learned so far; a new object whenever one is added. */
export function usePhotoAspects(): Record<string, number> {
  return useSyncExternalStore(
    subscribe,
    () => aspects,
    () => EMPTY,
  );
}

/** The ratios the rows already know (0070), by path, from the cards' photos. */
export function storedAspects(
  cards: { photos?: { path: string; aspect?: number }[] }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const card of cards) {
    for (const photo of card.photos ?? []) if (photo.aspect) out[photo.path] = photo.aspect;
  }
  return out;
}

/** The layout's measurements with the photos' ratios beside the words' lines. */
export function withAspects(measured: Measured, known: Record<string, number>): Measured {
  const out: Measured = { ...measured };
  for (const [path, ratio] of Object.entries(known)) out[aspectKey(path)] = ratio;
  return out;
}

/**
 * For an `<img>`: learns its ratio when it loads, and when it had loaded
 * already — an image the browser had at hand finishes before hydration
 * attaches `onLoad`, and that event is never seen.
 */
type Learns = {
  ref: (img: HTMLImageElement | null) => void;
  onLoad: (event: { currentTarget: HTMLImageElement }) => void;
};
const learners = new Map<string, Learns>();

/**
 * One pair of handlers per path, the same each render: a new ref callback
 * every render is detached and attached again on every commit, and each
 * attach wrote to the store from inside the commit.
 */
export function learnsAspect(path: string): Learns {
  const had = learners.get(path);
  if (had) return had;
  const note = (img: HTMLImageElement) =>
    notePhotoAspect(path, img.naturalWidth, img.naturalHeight);
  const made: Learns = {
    ref: (img) => {
      if (img?.complete && img.naturalWidth > 0) note(img);
    },
    onLoad: (event) => note(event.currentTarget),
  };
  learners.set(path, made);
  return made;
}
