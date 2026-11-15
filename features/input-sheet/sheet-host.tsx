'use client';

import { usePathname, useRouter } from 'next/navigation';

import { ComposeSheet } from '@/features/splash-sheet/compose-sheet';
import type { DropHandoff, SheetContext } from '@/features/splash-sheet/splash-composer';
import { SplashEditSheet } from '@/features/splash-sheet/splash-edit-sheet';

import { useInputSheet } from './sheet-provider';

/**
 * A drop, handed over (CLAUDE.md, the principle): the ground marks the post
 * and lands its card on the stack with the ring at once, the view returns
 * to Home if it was elsewhere, and the action runs behind it; a refusal
 * takes the post back and says why.
 */
function useDrop(): (drop: DropHandoff, refused: (message: string) => void) => void {
  const { markDropped, dropFailed } = useInputSheet();
  const router = useRouter();
  const pathname = usePathname();
  return (drop, refused) => {
    markDropped({
      splash: drop.splash,
      month: drop.month,
      note: drop.note,
      pool: drop.pool,
      home: drop.home,
    });
    // Dropped from a pool, the pool seats it where we are (H23); else Home.
    if (!drop.pool && !pathname.startsWith('/pool/') && pathname !== '/') router.push('/');
    // The commit revalidates: the page comes back with its answer.
    void drop.commit().then((result) => {
      if (result.ok) return;
      dropFailed(result.message);
      // Nothing was written: the sheet opens again as it was. Past the
      // splash, it exists, and only the message stands.
      if (!result.landed) refused(result.message);
    });
  };
}

/**
 * Mounts the composer sheet when the provider says it is open (H80): every
 * compose on a phone, and on a wide screen where there is no stack. Lives in
 * the shell, so a page opening it from anywhere reaches the same sheet.
 */
export function SheetHost({ context }: { context: SheetContext }) {
  const { sheet, closeSheet, reopenSheet } = useInputSheet();
  const drop = useDrop();

  if (!sheet) return null;
  if (sheet.kind === 'edit') {
    return (
      <SplashEditSheet
        splashId={sheet.splashId}
        context={context}
        pool={sheet.pool ?? null}
        onClose={closeSheet}
      />
    );
  }

  return (
    <ComposeSheet
      // A new opening, a new page: nothing carried over from the last.
      key={sheet.id}
      draft={sheet}
      context={context}
      onDiscard={closeSheet}
      onSave={(handoff, snapshot) => {
        // One render: the sheet goes and the post takes its seat, same id.
        closeSheet();
        drop(handoff, (error) => reopenSheet({ ...sheet, snapshot, error }));
      }}
    />
  );
}
