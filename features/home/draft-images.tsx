'use client';

import { ImagePlus, X } from 'lucide-react';

import type { useMediaAttach } from '@/features/input-sheet/media-field';

const TILE = 'relative h-14 w-14 shrink-0 overflow-hidden rounded-lg';

/**
 * The draft card's photos (H80): a square tile with the gallery icon that
 * adds them, and after it, in the same row and at the same size, what was
 * added — each with its × to take it off. The row scrolls sideways past the
 * card's width. A photo that would not go up says so under it.
 */
export function DraftImages({
  paths,
  media,
}: {
  paths: string[];
  media: ReturnType<typeof useMediaAttach>;
}) {
  const { attach, busy, input, progress, previews, failed, change } = media;
  return (
    <div data-draft-images className="flex flex-col gap-1.5">
      <ul data-media-previews className="no-scrollbar flex gap-2 overflow-x-auto">
        <li className="shrink-0">
          <button
            type="button"
            data-draft-add-image
            aria-label={busy ? (progress ?? 'Adding image') : 'Add image'}
            onClick={() => input.current?.click()}
            disabled={busy}
            className={`${TILE} bg-pool-100 text-pool-500 flex flex-col items-center justify-center gap-0.5 disabled:opacity-60`}
          >
            <ImagePlus aria-hidden size={20} strokeWidth={1.75} />
            {busy ? (
              <span className="text-[10px] tabular-nums">{progress ?? 'Adding…'}</span>
            ) : null}
          </button>
          {/* Camera or gallery: the phone offers both for an image input. */}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-media-input
            onChange={(event) => attach(event.target.files)}
          />
        </li>
        {paths.map((path) => (
          <li key={path} className={`${TILE} bg-pool-100`}>
            {previews[path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previews[path]} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-pool-500 block truncate px-1 pt-5 text-center text-[10px]">
                {path.split('/').pop()}
              </span>
            )}
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => change(paths.filter((p) => p !== path))}
              className="text-ink absolute top-1 right-1 rounded-full bg-white/80 p-0.5"
            >
              <X aria-hidden size={12} />
            </button>
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="text-ink text-xs whitespace-pre-line">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
