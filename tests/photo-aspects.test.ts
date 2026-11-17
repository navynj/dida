// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  learnsAspect,
  notePhotoAspect,
  usePhotoAspects,
} from '@/features/month-board/photo-aspects';

/**
 * A photo's ratio, learned once (2026-11-16): the board's thumb and a shared
 * image's display copy of one photo differ by rounding, and rewriting the
 * ratio for each re-rendered every board until React gave up.
 */
describe('a photo’s learned ratio', () => {
  it('keeps the first ratio against a copy a hair apart, and re-renders no one', () => {
    const path = `p-${Math.random()}`;
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return usePhotoAspects();
    });
    act(() => notePhotoAspect(path, 300, 300));
    const after = renders;
    act(() => {
      notePhotoAspect(path, 512, 507); // 1.0099: the display copy, rounded otherwise
      notePhotoAspect(path, 300, 300);
    });
    expect(renders).toBe(after);
    expect(result.current[path]).toBe(1);
  });

  it('takes a ratio that is another photo’s, beyond rounding', () => {
    const path = `p-${Math.random()}`;
    notePhotoAspect(path, 400, 300);
    notePhotoAspect(path, 300, 400);
    const { result } = renderHook(() => usePhotoAspects());
    expect(result.current[path]).toBe(0.75);
  });

  it('gives each path the same handlers every render, so React attaches its ref once', () => {
    const path = `p-${Math.random()}`;
    expect(learnsAspect(path)).toBe(learnsAspect(path));
  });
});
