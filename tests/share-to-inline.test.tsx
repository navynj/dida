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
  it('is one row: the label, the chips, and “Only you” at its end while none is on', () => {
    const { container } = render(<Row />);
    const row = container.querySelector('[data-share-to]')!;
    const line = row.firstElementChild!;
    expect(line.firstElementChild!.textContent).toBe('Share to');
    const status = line.querySelector('[data-share-private]')!;
    expect(status.textContent).toBe('Only you');
    // At the row's right end, after the last chip; no line under the row.
    expect(line.lastElementChild!.contains(status)).toBe(true);
    expect(line.lastElementChild!.className).toContain('ml-auto');
    expect(row.querySelectorAll('[data-share-private]')).toHaveLength(1);
    expect(row.textContent).not.toContain('Only you can see this');
  });

  it('drops the status once a pool is on, the chip’s selected state saying it, and says it again when off', () => {
    const { container } = render(<Row />);
    fireEvent.click(container.querySelector('[data-share-pool="p-crew"]')!);
    expect(container.querySelector('[data-share-pool="p-crew"]')!.hasAttribute('data-on')).toBe(
      true,
    );
    expect(container.querySelector('[data-share-private]')).toBeNull();
    fireEvent.click(container.querySelector('[data-share-pool="p-crew"] button')!);
    expect(container.querySelector('[data-share-private]')!.textContent).toBe('Only you');
  });

  it('with no diary to share to, is the status alone: private is still said while writing', () => {
    const { container } = render(<Row pools={[]} />);
    expect(container.querySelector('[data-share-to]')!.textContent).toBe('Only you');
  });
});
