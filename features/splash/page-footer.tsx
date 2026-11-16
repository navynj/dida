'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The page's foot (H75, H80 twelfth pass): *Add to this page*, pinned to
 * the bottom of the page sheet on a phone and of the panel on a wide
 * screen, while the header, the tabs and the notes scroll above it. It is
 * the sheet body's last row, so a phone's sheet still fits its content, and
 * the sheet ends on the keyboard (splash-modal), so it sits above it. Open
 * to a few lines, it grows upward and the notes scroll. A hairline over it
 * only while something lies under it.
 */
export function PageFooter({ children }: { children: ReactNode }) {
  const foot = useRef<HTMLDivElement>(null);
  const [under, setUnder] = useState(false);

  useLayoutEffect(() => {
    const scroller = foot.current?.closest<HTMLElement>('[data-sheet-body]');
    if (!scroller) return;
    const measure = (): void =>
      setUnder(scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
    measure();
    scroller.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(scroller);
    if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      ref={foot}
      data-page-footer
      data-under={under ? '' : undefined}
      // Edge to edge on white, as the thread tabs are; the sheet body's
      // bottom padding is this row's own (splash-modal).
      className={`sticky bottom-0 z-10 -mx-6 mt-auto border-t bg-white px-6 pt-3 lg:-mx-8 lg:px-8 ${
        under ? 'border-pool-200' : 'border-transparent'
      }`}
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {children}
    </div>
  );
}
