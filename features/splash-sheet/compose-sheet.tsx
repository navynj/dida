'use client';

import { useRef } from 'react';

import { useWide } from '@/components/ui/use-wide';
import { DraftCard, type ComposeDraft } from '@/features/home/draft-card';
import { SplashModal } from '@/features/splash/splash-modal';

import { SheetFrame } from './sheet-frame';
import type { DropHandoff, SheetContext } from './splash-composer';
import type { ComposerSnapshot } from './use-composer';

/**
 * The one composer sheet (H80). On a phone, the page sheet a card opens on a
 * tap — its frame, grabber, geometry and keyboard rules — at its full height,
 * holding the draft card's fields in the draft card's order. On a wide
 * screen with no stack to write on (a lane's page, the diary list, the
 * ground loading), the same fields in the post sheet's frame; a wide screen
 * with a stack writes on the stack instead and never opens this.
 *
 * Its ways out — a drag down, the dimmed screen, Escape — are Cancel's: with
 * anything written, *Discard this page?* is asked inside it first.
 */
export function ComposeSheet({
  draft,
  context,
  onDiscard,
  onSave,
}: {
  draft: ComposeDraft;
  context: SheetContext;
  onDiscard: () => void;
  onSave: (handoff: DropHandoff, snapshot: ComposerSnapshot) => void;
}) {
  const wide = useWide();
  // Cancel, as the card has it: asks first when something is written.
  const dismiss = useRef<(() => void) | null>(null);
  const ask = (): void => (dismiss.current ?? onDiscard)();
  const card = (
    <DraftCard
      draft={draft}
      context={context}
      onDiscard={onDiscard}
      onSave={onSave}
      dismissRef={dismiss}
    />
  );
  if (wide) {
    return (
      <SheetFrame
        label="New page"
        onClose={ask}
        data={{ 'data-compose-sheet': '' }}
        className="h-[640px]"
        bodyClassName=""
        footer
      >
        {card}
      </SheetFrame>
    );
  }
  return (
    <SplashModal
      closeTo={null}
      onLeave={onDiscard}
      onDismiss={ask}
      label="New page"
      fill
      fit
      data={{ 'data-compose-sheet': '' }}
    >
      {card}
    </SplashModal>
  );
}
