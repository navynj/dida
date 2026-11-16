import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

// jsdom has no matchMedia: a phone's width unless a test says otherwise
// (useWide reads it wherever a picker differs by breakpoint, H75, H80).
// Only where absent, so a file's own stub stands.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}
