// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
}));

import {
  BINDING_BAND_PX,
  COIL_MARGIN_PX,
  COIL_PITCH_PX,
  COIL_RISE_PX,
  coilXs,
  HOLE_CY_PX,
  holeMask,
} from '@/features/home/binding';
import { CARD_PAD_PX } from '@/features/home/card-face';
import { placeCard, type Card } from '@/features/home/grid';
import { BINDING_Z, depthZ, StairBoard, UP_STEP_PX } from '@/features/home/stair-board';
import { useFlip } from '@/features/home/use-flip';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import { ThemeProvider } from '@/features/people/theme-provider';
import { summarizeSplash } from '@/features/splash/summary';

const TZ = 'America/Vancouver';
const WIDTH = 358;

/** jsdom has no layout: every observed box is a phone's card wide. */
class FixedResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe(el: HTMLElement): void {
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: WIDTH });
    this.callback();
  }
  disconnect(): void {}
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedResizeObserver);
  // A phone: no wide query matches, motion not reduced.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function card(id: string, day: string): Card {
  const created = `${day}T19:00:00.000Z`;
  return placeCard(
    summarizeSplash(
      {
        id,
        owner_id: 'a1',
        title: id,
        declared_start: day,
        declared_end: null,
        declared_lane_id: null,
        icon: null,
        session_id: null,
        pinned_at: null,
        pool_id: null,
        pool_lane_id: null,
        own_pool_id: null,
        created_by: null,
        joint_invite_all: false,
        is_welcome: false,
        description: null,
        type: 'free',
        prompt: null,
        ends_at: null,
        created_at: created,
        written_on: day,
      },
      [],
      TZ,
      new Date(created),
    ),
    '',
    TZ,
  );
}
const CARDS = [card('a', '2026-09-20'), card('b', '2026-09-12'), card('c', '2026-09-08')];

function Stack({ collapsed = false, top = 'a' }: { collapsed?: boolean; top?: string }) {
  const flip = useFlip(
    CARDS.map((c) => c.splash.id),
    top,
    -1,
  );
  return (
    <StairBoard
      cards={CARDS}
      flip={flip}
      categories={[]}
      initials="YL"
      pinnedIds={new Set()}
      onPin={() => {}}
      onDelete={() => {}}
      collapsed={collapsed}
    />
  );
}
function stack(
  props: { collapsed?: boolean; top?: string } = {},
  mode: 'light' | 'dark' | 'pastel' = 'light',
) {
  return render(
    <ThemeProvider initial={{ home: 'black', mode, everywhere: false }}>
      <PeopleProvider me="u-me" people={{}}>
        <InputSheetProvider>
          <Stack {...props} />
        </InputSheetProvider>
      </PeopleProvider>
    </ThemeProvider>,
  );
}

describe('the spiral binding (H81)', () => {
  it('spaces the coils evenly by the card’s width, centred, clear of the corners', () => {
    const xs = coilXs(WIDTH);
    expect(xs.length).toBe(Math.floor((WIDTH - 2 * COIL_MARGIN_PX) / COIL_PITCH_PX) + 1);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i] - xs[i - 1]).toBe(COIL_PITCH_PX);
    expect(xs[0] - 0).toBeCloseTo(WIDTH - xs[xs.length - 1], 5);
    expect(xs[0]).toBeGreaterThanOrEqual(COIL_MARGIN_PX);
    expect(coilXs(2 * COIL_MARGIN_PX)).toEqual([]);
  });

  it('draws one binding, front and back, straddling the top card, never a target', async () => {
    const { container } = stack();
    const back = container.querySelector<SVGElement>('[data-stack] > [data-binding="back"]')!;
    const front = container.querySelector<SVGElement>('[data-stack] > [data-binding="front"]')!;
    expect(back.querySelectorAll('[data-coil]')).toHaveLength(coilXs(WIDTH).length);
    expect(front.querySelectorAll('[data-coil]')).toHaveLength(coilXs(WIDTH).length);
    // At rest, just under the top card: its z follows the card nearest the top.
    await waitFor(() => expect(Number(back.style.zIndex)).toBe(BINDING_Z.back));
    expect(Number(front.style.zIndex)).toBe(BINDING_Z.front);
    // Under the top card, over everything a step away; over the top card, a draft included.
    expect(BINDING_Z.back).toBeLessThan(depthZ(0));
    expect(BINDING_Z.back).toBeGreaterThan(depthZ(1));
    expect(BINDING_Z.back).toBeGreaterThan(depthZ(-1));
    expect(BINDING_Z.front).toBeGreaterThan(depthZ(0, true));
    for (const half of [back, front]) {
      expect(half.getAttribute('class')).toContain('pointer-events-none');
      // It rises R above the top card's edge, and no more.
      expect(half.style.top).toBe(`-${COIL_RISE_PX}px`);
    }
    // One binding, not one per card.
    expect(container.querySelectorAll('[data-binding]')).toHaveLength(2);
  });

  it('cuts the holes through the top card’s face on the dark ground, and none in the read card’s strip', async () => {
    const { container } = stack({ top: 'b' }, 'dark');
    expect(container.querySelector('[data-holes="drawn"]')).toBeNull();
    const faceOf = (id: string): HTMLElement =>
      container.querySelector<HTMLElement>(`[data-stack-card="${id}"] > div`)!;
    const maskOf = (id: string): string =>
      faceOf(id).style.maskImage || faceOf(id).style.getPropertyValue('mask-image');
    // Placed once the face is measured, on the motion's next frame.
    await waitFor(() => expect(maskOf('b')).toBe(holeMask(WIDTH, 4)));
    const mask = maskOf('b');
    for (const x of coilXs(WIDTH)) expect(mask).toContain(`at ${x.toFixed(1)}px ${HOLE_CY_PX}px`);
    // The read card above: its bookmark strip carries no holes.
    const read = maskOf('a');
    expect(read === '' || read === 'none').toBe(true);
  });

  it('draws the holes on the light and pastel grounds: the next card’s tone, a 1px pool-200 edge', async () => {
    for (const mode of ['light', 'pastel'] as const) {
      const { container } = stack({ top: 'b' }, mode);
      const face = container.querySelector<HTMLElement>('[data-stack-card="b"] > div')!;
      const drawn = face.querySelector('[data-holes="drawn"]')!;
      const holes = [...drawn.querySelectorAll('[data-hole]')];
      expect(holes.map((h) => Number(h.getAttribute('cx')))).toEqual(coilXs(WIDTH));
      for (const hole of holes) {
        expect(hole.getAttribute('cy')).toBe(String(HOLE_CY_PX));
        expect(hole.getAttribute('fill')).toBe('var(--surface-2)');
        expect(hole.getAttribute('stroke')).toBe('var(--color-pool-200)');
        expect(hole.getAttribute('stroke-width')).toBe('1');
      }
      // Nothing cut through: the drawn hole is the whole of it.
      expect(face.style.maskImage || 'none').toBe('none');
      // The read card's strip: faded out a step away.
      const read = container.querySelector<HTMLElement>(
        '[data-stack-card="a"] [data-holes="drawn"]',
      );
      await waitFor(() => expect(Number(read!.style.opacity)).toBe(0));
      cleanup();
    }
  });

  it('pushes the top card’s words below the band, and leaves the bookmark its own step above the coils', () => {
    const { container } = stack();
    const words = container.querySelector<HTMLElement>(
      '[data-stack-card="a"] [data-card-compact]',
    )!;
    expect(words.style.paddingTop).toBe(`${CARD_PAD_PX + BINDING_BAND_PX}px`);
    expect(UP_STEP_PX).toBe(22 + COIL_RISE_PX);
  });

  it('is gone with the collapsed stack', () => {
    const { container } = stack({ collapsed: true });
    expect(container.querySelector('[data-stack-collapsed]')).not.toBeNull();
    expect(container.querySelector('[data-binding]')).toBeNull();
  });
});
