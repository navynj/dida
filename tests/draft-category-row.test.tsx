// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DraftCategoryRow, frontFirst } from '@/features/home/draft-category-row';
import { PeopleProvider } from '@/features/people/people-provider';
import type { Composer } from '@/features/splash-sheet/use-composer';

afterEach(cleanup);

const CATS = [
  { id: 'c-day', name: 'Day', icon: '🖋' },
  { id: 'c-walk', name: 'Walks', icon: '🚶' },
  { id: 'c-food', name: 'Food', icon: '🍜' },
  { id: 'c-film', name: 'Films', icon: '🎬' },
];

/** The composer's category fields, the rest left out: the row reads no more. */
function Harness({ onKey }: { onKey?: () => void }) {
  const [laneId, setLaneId] = useState<string | null>(null);
  const c = {
    categories: CATS,
    pool: null,
    pick: null,
    laneId,
    setLaneId,
    setShare: () => {},
    together: { everyone: false, picked: [] },
  } as unknown as Composer;
  return (
    <PeopleProvider me="u-me" people={{}}>
      {/* The card's own Escape, which the search must not reach. */}
      <div onKeyDown={(e) => e.key === 'Escape' && onKey?.()}>
        <DraftCategoryRow composer={c} pools={[]} />
      </div>
    </PeopleProvider>
  );
}

const line = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-category-line]')!;
const names = (c: HTMLElement) =>
  [...line(c).querySelectorAll('[data-pick-category]')].map((b) =>
    b.getAttribute('data-pick-category'),
  );

describe('the composer’s category row (H80, ninth pass)', () => {
  it('is one line the full width: the search button, then every chip, grey, sideways', () => {
    const { container } = render(<Harness />);
    const row = container.querySelector('[data-draft-category-row]')!;
    expect(row.firstElementChild!.getAttribute('aria-label')).toBe('Search categories');
    expect(line(container).className).toContain('overflow-x-auto');
    expect(line(container).className).not.toContain('flex-wrap');
    expect(names(container)).toEqual(['c-day', 'c-walk', 'c-food', 'c-film']);
    for (const chip of line(container).querySelectorAll('[data-pick-category]')) {
      expect(chip.getAttribute('aria-pressed')).toBe('false');
      expect(chip.className).toContain('bg-pool-100');
    }
    // No + Category, no popover trigger.
    expect(container.textContent).not.toContain('+ Category');
    expect(container.querySelector('[aria-haspopup]')).toBeNull();
  });

  it('fills the chosen chip and moves it to the front; a second tap lets go', () => {
    const { container } = render(<Harness />);
    fireEvent.click(line(container).querySelector('[data-pick-category="c-food"]')!);
    expect(names(container)).toEqual(['c-food', 'c-day', 'c-walk', 'c-film']);
    const chosen = line(container).querySelector('[data-pick-category="c-food"]')!;
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    expect(chosen.className).toContain('bg-(--accent-fill)');
    fireEvent.click(chosen);
    expect(names(container)).toEqual(['c-day', 'c-walk', 'c-food', 'c-film']);
  });

  it('fades the right edge only while chips lie past it', () => {
    const proto = HTMLElement.prototype;
    const sizes = { scroll: 600, client: 300 };
    const keep = ['scrollWidth', 'clientWidth'].map(
      (k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const,
    );
    Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => sizes.scroll });
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => sizes.client });
    try {
      const { container } = render(<Harness />);
      expect(line(container).hasAttribute('data-more')).toBe(true);
      expect(line(container).className).toContain('mask-image');
      sizes.scroll = 300;
      act(() => {
        line(container).dispatchEvent(new Event('scroll'));
      });
      expect(line(container).hasAttribute('data-more')).toBe(false);
    } finally {
      for (const [k, d] of keep) {
        if (d) Object.defineProperty(proto, k, d);
        else Reflect.deleteProperty(proto, k);
      }
    }
  });

  it('turns into a search field in place, filtering the chips on the same line', () => {
    const { container, getByLabelText } = render(<Harness />);
    fireEvent.click(getByLabelText('Search categories'));
    const field = getByLabelText('Search categories') as HTMLInputElement;
    expect(field.tagName).toBe('INPUT');
    expect(document.activeElement).toBe(field);
    // The same row: the field, then the line.
    const row = container.querySelector('[data-draft-category-row]')!;
    expect(row.contains(field)).toBe(true);
    expect(row.contains(line(container))).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.change(field, { target: { value: 'fo' } });
    expect(names(container)).toEqual(['c-food']);
    fireEvent.change(field, { target: { value: 'zz' } });
    expect(names(container)).toEqual([]);
    expect(container.querySelector('[data-category-none]')).not.toBeNull();
  });

  it('keeps the choice when × or Escape closes the search, and its Escape stays its own', () => {
    let cardEscapes = 0;
    const { container, getByLabelText } = render(<Harness onKey={() => (cardEscapes += 1)} />);
    fireEvent.click(getByLabelText('Search categories'));
    fireEvent.change(getByLabelText('Search categories'), { target: { value: 'wa' } });
    fireEvent.click(line(container).querySelector('[data-pick-category="c-walk"]')!);
    fireEvent.keyDown(getByLabelText('Search categories'), { key: 'Escape' });
    expect(container.querySelector('[data-category-search-field]')).toBeNull();
    expect(cardEscapes).toBe(0);
    // Every chip again, the choice kept and first.
    expect(names(container)).toEqual(['c-walk', 'c-day', 'c-food', 'c-film']);
    fireEvent.click(getByLabelText('Search categories'));
    fireEvent.change(getByLabelText('Search categories'), { target: { value: 'fi' } });
    fireEvent.click(container.querySelector('[data-category-search-close]')!);
    expect(container.querySelector('[data-category-search-field]')).toBeNull();
    expect(names(container)).toEqual(['c-walk', 'c-day', 'c-food', 'c-film']);
    expect(
      line(container).querySelector('[data-pick-category="c-walk"]')!.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('from a pool, offers its lanes on the row, and Together under it once one is chosen', () => {
    function Pool() {
      const [pick, setPick] = useState<{ poolLaneId: string } | null>(null);
      const c = {
        categories: CATS,
        pool: {
          poolId: 'p',
          poolName: 'Our Pool',
          lanes: [
            { id: 'pl-trips', name: 'Trips', icon: '🏕' },
            { id: 'pl-food', name: 'Food', icon: '🍜' },
          ],
          members: [
            { id: 'u-me', name: 'Me', initials: 'ME' },
            { id: 'u-mina', name: 'Mina', initials: 'MI' },
          ],
        },
        pick,
        setPick,
        laneId: null,
        together: { everyone: false, picked: [] },
        setTogether: () => {},
      } as unknown as Composer;
      return (
        <PeopleProvider me="u-me" people={{}}>
          <DraftCategoryRow composer={c} pools={[]} />
        </PeopleProvider>
      );
    }
    const { container } = render(<Pool />);
    expect(names(container)).toEqual(['pl-trips', 'pl-food']);
    expect(container.querySelector('[data-together]')).toBeNull();
    fireEvent.click(line(container).querySelector('[data-pick-category="pl-food"]')!);
    expect(names(container)).toEqual(['pl-food', 'pl-trips']);
    expect(container.querySelector('[data-together]')).not.toBeNull();
    // The lanes once, on the row: the picker under it shows no second set.
    expect(container.querySelectorAll('[data-pick-pool-lane]')).toHaveLength(0);
  });

  it('puts the chosen one first, the rest in their order', () => {
    expect(frontFirst(CATS, 'c-film').map((c) => c.id)).toEqual([
      'c-film',
      'c-day',
      'c-walk',
      'c-food',
    ]);
    expect(frontFirst(CATS, null)).toBe(CATS);
  });
});
