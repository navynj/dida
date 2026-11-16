'use client';

import { PersonName } from '@/features/people/avatar';
import { relativeTime } from '@/features/responses/model';

/**
 * A note's first line on a page more than one person wrote on (H80,
 * twelfth pass), beside its avatar: the author's name and when, as a reply
 * says it (*Jessie · Oct 28*, *3h* within the week), then where it was
 * written when the All tab names it (*· in WhaleFox*). A page of one says
 * none of this: the meta row's author covers it (H75(c)).
 */
export function NoteByline({
  authorId,
  at,
  where = null,
}: {
  authorId: string;
  at: string;
  where?: string | null;
}) {
  return (
    <span data-note-byline className="flex min-w-0 flex-wrap items-baseline gap-x-1">
      <span data-note-author={authorId} className="text-ink font-medium">
        <PersonName id={authorId} name="Someone" />
      </span>
      <span data-note-when>· {relativeTime(at)}</span>
      {where ? (
        <span data-ripple-thread-label className="font-medium">
          · {where}
        </span>
      ) : null}
    </span>
  );
}
