'use client';

import { initialsOf as initialsFrom } from '@/features/home/grid';
import { Avatar, PersonName } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';

/**
 * One person, face and name: the page's top row (the composer's skeleton,
 * H80 eighth pass) and a card's meta row.
 */
export function AuthorFace({
  id,
  initialsOf,
  data = { 'data-splash-author': id },
  size = 'page',
  fallback = 'Someone',
}: {
  id: string;
  initialsOf: Record<string, string>;
  data?: Record<`data-${string}`, string>;
  /** A card's meta row is smaller than the page's (H80, tenth pass). */
  size?: 'page' | 'card';
  /** The name when the people list has none (a card knows its author's). */
  fallback?: string;
}) {
  const { people } = usePeople();
  const name = people[id]?.name ?? fallback;
  const card = size === 'card';
  return (
    <span {...data} className={`flex min-w-0 items-center ${card ? 'gap-1.5' : 'gap-2'}`}>
      <Avatar
        id={id}
        initials={initialsOf[id] ?? initialsFrom(name)}
        className={`bg-pool-100 text-pool-500 flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
          card ? 'h-5 w-5' : 'h-7 w-7'
        }`}
      />
      <span className={`text-ink truncate font-medium ${card ? 'text-xs' : 'text-sm'}`}>
        <PersonName id={id} name={name} />
      </span>
    </span>
  );
}
