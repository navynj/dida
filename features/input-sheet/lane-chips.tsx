'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

import { CategoryChip } from '@/components/ui/chips/category-chip';
import type { MyCategory } from '@/lib/queries/profile';

/**
 * Past this many lanes a search field renders above the row. A constant, not
 * a measurement: mere one-row overflow scrolls silently, and a search box over
 * six chips would be a control for a problem the author does not have.
 */
export const LANE_SEARCH_THRESHOLD = 8;

/**
 * The sheet's top zone (`_docs/mockups/sheet-ripple.png`): the lane chips in
 * one horizontally scrolling row, selected = ink fill (H20f).
 *
 * Always the author's (H21f): a post's declared lane is where the selection
 * starts, never a narrowing of what may be chosen.
 */
export function LaneChips({
  categories,
  selectedId,
  onSelect,
  surface = 'pool',
  search = 'past-threshold',
  wrap = false,
}: {
  categories: Pick<MyCategory, 'id' | 'name' | 'icon'>[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The row's own ground: the old sheet's grey band, or a white page. */
  surface?: 'pool' | 'white';
  /**
   * When the search field shows: past LANE_SEARCH_THRESHOLD (the post
   * sheet), or always (the draft card's category picker, H80).
   */
  search?: 'past-threshold' | 'always';
  /** The chips wrap onto rows instead of scrolling sideways (the draft card's picker, H80). */
  wrap?: boolean;
}) {
  const [query, setQuery] = useState('');
  const offered = categories;
  const searchable = search === 'always' || offered.length > LANE_SEARCH_THRESHOLD;
  const shown = searchable
    ? offered.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : offered;

  return (
    <div
      className={
        surface === 'pool'
          ? 'bg-pool-100 flex flex-col gap-2 px-5 pt-3 pb-3'
          : 'flex flex-col gap-2'
      }
    >
      {searchable ? (
        <PickerSearch
          value={query}
          onChange={setQuery}
          placeholder="Search categories"
          pill={search === 'always'}
        />
      ) : null}

      {/* No scroll indicator: a bar under a row of chips reads as a gauge,
          which law 2 forbids. They scroll silently. */}
      <div
        role="group"
        aria-label="Category"
        className={
          wrap ? 'flex flex-wrap gap-1.5' : 'no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1'
        }
      >
        {shown.map((category) => (
          <CategoryChip
            key={category.id}
            icon={category.icon}
            name={category.name}
            selected={category.id === selectedId}
            // Tapping the chosen chip again lets go of it: no lane is a
            // valid state, and the residual lane takes the fragment.
            onSelect={() => onSelect(category.id === selectedId ? null : category.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A picker's search field (H80): it filters as you type. `pill`, the draft
 * card's pickers, gives it the grey fill of the chips under it.
 */
export function PickerSearch({
  value,
  onChange,
  placeholder,
  pill = false,
}: {
  value: string;
  onChange: (query: string) => void;
  placeholder: string;
  pill?: boolean;
}) {
  return (
    <label
      className={`text-pool-500 flex items-center gap-2 text-base ${
        pill ? 'bg-pool-100 rounded-full px-3 py-1.5' : ''
      }`}
    >
      <Search aria-hidden size={14} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="placeholder:text-pool-500 text-ink min-w-0 flex-1 bg-transparent outline-none placeholder:opacity-60"
      />
    </label>
  );
}
