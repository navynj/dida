// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AudiencePick } from '@/features/pool/audience';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import { ShareToRow } from '@/features/splash-sheet/share-to-row';

afterEach(cleanup);

const POOLS: AudiencePool[] = [
  { id: 'p-ours', name: 'Our Pool', lanes: [{ id: 'pl-trips', name: 'Trips', icon: '🏕' }] },
  { id: 'p-crew', name: 'Crew', lanes: [{ id: 'cr-out', name: 'Outings', icon: '🚲' }] },
];

/** The row as the draft card holds it: one line, its status at the end (H80). */
function Row({ pools = POOLS }: { pools?: AudiencePool[] }) {
  const [shared, setShared] = useState<AudiencePick[]>([]);
  return (
    <ShareToRow
      inline
      pools={pools}
      shared={shared}
      startLane={(poolId) => pools.find((p) => p.id === poolId)?.lanes[0]?.id ?? null}
      onTurn={(poolId, poolLaneId) =>
        setShared((was) =>
          poolLaneId
            ? [...was.filter((p) => p.poolId !== poolId), { poolId, poolLaneId }]
            : was.filter((p) => p.poolId !== poolId),
        )
      }
      onPick={() => {}}
    />
  );
}

describe('Share to on the draft card (H80, H75)', () => {
  it('reads as one line: Share to, the chips, and “Not shared yet” right after the last chip', () => {
    const { container } = render(<Row />);
    const row = container.querySelector('[data-share-to]')!;
    const text = row.textContent!;
    // In reading order: the label, each pool, then the status.
    const at = ['Share to', 'Our Pool', 'Crew', 'Not shared yet'].map((w) => text.indexOf(w));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(text.endsWith('Not shared yet')).toBe(true);
  });

  it('puts the status in the chips’ own wrapping group, after the last chip, never floated to the end', () => {
    const { container } = render(<Row />);
    const status = container.querySelector('[data-share-private]')!;
    expect(status.textContent).toBe('Not shared yet');
    expect(status.className).toContain('text-pool-500');
    expect(status.className).toContain('text-xs');
    expect(status.className).not.toContain('ml-auto');
    // A sibling of the chips, straight after the last one: wrapped, it starts
    // where the first chip does, not under the label.
    const group = status.parentElement!;
    expect(group.className).toContain('flex-wrap');
    expect(status.previousElementSibling!.getAttribute('data-share-pool')).toBe('p-crew');
    expect(group.firstElementChild!.getAttribute('data-share-pool')).toBe('p-ours');
    expect(group.parentElement!.firstElementChild!.textContent).toBe('Share to');
    expect(container.querySelectorAll('[data-share-private]')).toHaveLength(1);
  });

  it('drops the status once a pool is on, the chip’s selected state saying it, and says it again when all are off', () => {
    const { container } = render(<Row />);
    fireEvent.click(container.querySelector('[data-share-pool="p-crew"]')!);
    fireEvent.click(container.querySelector('[data-share-pool="p-ours"]')!);
    expect(container.querySelector('[data-share-pool="p-crew"]')!.hasAttribute('data-on')).toBe(
      true,
    );
    expect(container.querySelector('[data-share-private]')).toBeNull();
    // One still on: still shared.
    fireEvent.click(container.querySelector('[data-share-pool="p-crew"] button')!);
    expect(container.querySelector('[data-share-private]')).toBeNull();
    fireEvent.click(container.querySelector('[data-share-pool="p-ours"] button')!);
    expect(container.querySelector('[data-share-private]')!.textContent).toBe('Not shared yet');
  });

  it('with no diary to share to, drops Share to and says the full private sentence', () => {
    const { container } = render(<Row pools={[]} />);
    const row = container.querySelector('[data-share-to]')!;
    expect(row.textContent).toBe('Only you can see this');
    expect(row.textContent).not.toContain('Share to');
  });
});
