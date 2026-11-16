import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';

import { splashPath } from '@/lib/routes';

import { asAdmin } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * *Add to this page* is the page's pinned footer (H80, thirteenth pass):
 * at the bottom of a short page (a phone's sheet fitting it; the wide
 * panel full height, the room above the row), and of a long one while its
 * notes scroll, a hairline over it only then; on a phone, above the
 * keyboard. One throwaway person with a short and a long page, against the
 * local stack, removed after.
 */
const admin = asAdmin();
const KEYBOARD_PX = 340;
let me = { id: '', cookie: '' };
let short = '';
let long = '';

test.beforeAll(async () => {
  const email = `page-footer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  const id = made.data.user.id;
  await admin.from('profiles').insert({ id, display_name: 'Kay', timezone: 'America/Vancouver' });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const verified = await fetch(link.data.properties.action_link, { redirect: 'manual' });
  const hash = new URLSearchParams(verified.headers.get('location')!.split('#')[1]);
  const session = {
    access_token: hash.get('access_token'),
    refresh_token: hash.get('refresh_token'),
    token_type: 'bearer',
    expires_in: Number(hash.get('expires_in')),
    expires_at: Number(hash.get('expires_at')),
    user: made.data.user,
  };
  me = { id, cookie: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url') };
  const lane = await admin
    .from('my_categories')
    .insert({ user_id: id, name: 'Day', icon: '🌊' })
    .select('id')
    .single();
  if (lane.error) throw lane.error;
  short = crypto.randomUUID();
  long = crypto.randomUUID();
  const pages = await admin.from('splashes').insert([
    {
      id: short,
      owner_id: id,
      title: 'A short page',
      declared_start: '2026-11-13',
      declared_lane_id: lane.data.id,
    },
    {
      id: long,
      owner_id: id,
      title: 'A long page',
      declared_start: '2026-11-12',
      declared_lane_id: lane.data.id,
    },
  ]);
  if (pages.error) throw pages.error;
  const notes = await admin.from('ripples').insert([
    { author_id: id, note: 'Coffee by the window.', splash_id: short },
    ...Array.from({ length: 24 }, (_, i) => ({
      author_id: id,
      note: `Note ${i + 1}. A paragraph long enough to take a few lines on a phone, so the page runs well past the sheet and its notes scroll under the add row.`,
      splash_id: long,
    })),
  ]);
  if (notes.error) throw notes.error;
});

test.afterAll(async () => {
  if (me.id) {
    await admin.from('splashes').delete().eq('owner_id', me.id);
    await admin.auth.admin.deleteUser(me.id);
  }
});

async function open(page: Page, baseURL: string, id: string): Promise<void> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page
    .context()
    .addCookies([{ name: `sb-${ref}-auth-token`, value: me.cookie, url: baseURL }]);
  await page.goto(splashPath(id));
  await expect(page.locator('[data-splash-sheet] [data-add-field]')).toBeVisible({
    timeout: 90_000,
  });
  // The sheet's rise settled.
  await page.waitForTimeout(800);
}

/** The footer's box, the sheet's, the last note's and the room the viewport leaves. */
async function boxes(page: Page) {
  return page.evaluate(() => {
    const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const notes = document.querySelectorAll('[data-splash-sheet] [data-block-entry]');
    const last = notes[notes.length - 1].getBoundingClientRect();
    const body = document.querySelector<HTMLElement>('[data-splash-sheet] [data-sheet-body]')!;
    return {
      footer: rect('[data-splash-sheet] [data-page-footer]'),
      sheet: rect('[data-splash-sheet]'),
      lastBottom: last.bottom,
      room: window.visualViewport!.height,
      scrolls: body.scrollHeight > body.clientHeight + 1,
      under: document.querySelector('[data-page-footer]')!.hasAttribute('data-under'),
    };
  });
}

test('a short page: the add row at the bottom of the sheet, no hairline', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  await open(page, baseURL!, short);
  const b = await boxes(page);
  expect(b.scrolls).toBe(false);
  expect(b.under).toBe(false);
  // The footer is the sheet's last row, flush with its bottom.
  expect(Math.abs(b.footer.bottom - b.sheet.bottom)).toBeLessThan(2);
  if (info.project.name === 'desktop') {
    // Full-height panel: the room sits between the notes and the add row.
    expect(b.sheet.bottom).toBeGreaterThan(b.room - 2);
    expect(b.footer.top - b.lastBottom).toBeGreaterThan(200);
  } else {
    // A phone's sheet fits its content: the add row follows the note.
    expect(b.footer.top - b.lastBottom).toBeLessThan(40);
  }
  if (process.env.SHOT_DIR) {
    await page.screenshot({
      path: `${process.env.SHOT_DIR}/footer-short-${info.project.name}.png`,
    });
  }
});

test('a long page: the add row stays at the bottom while the notes scroll under it', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  await open(page, baseURL!, long);
  let b = await boxes(page);
  expect(b.scrolls).toBe(true);
  expect(Math.abs(b.footer.bottom - b.sheet.bottom)).toBeLessThan(2);
  await expect(page.locator('[data-page-footer]')).toHaveAttribute('data-under', '');
  // Halfway down: still pinned, the notes under it.
  await page.locator('[data-splash-sheet] [data-sheet-body]').evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  });
  b = await boxes(page);
  expect(Math.abs(b.footer.bottom - b.sheet.bottom)).toBeLessThan(2);
  await expect(page.locator('[data-page-footer]')).toHaveAttribute('data-under', '');
  await expect(page.locator('[data-splash-sheet] [data-add-field]')).toBeInViewport();
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/footer-long-${info.project.name}.png` });
  }
  // At the end: the last note just above it, nothing under it, no hairline.
  await page.locator('[data-splash-sheet] [data-sheet-body]').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.locator('[data-page-footer]')).not.toHaveAttribute('data-under', '');
  b = await boxes(page);
  expect(b.lastBottom).toBeLessThanOrEqual(b.footer.top + 1);
});

test('on a phone, the add row sits above the keyboard and opens upward', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'phone', 'a phone’s keyboard');
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const real = window.visualViewport!;
    const fake = new EventTarget();
    let keyboard = 0;
    for (const key of ['width', 'offsetLeft', 'pageLeft', 'pageTop', 'scale'] as const) {
      Object.defineProperty(fake, key, { get: () => real[key] });
    }
    Object.defineProperty(fake, 'height', { get: () => window.innerHeight - keyboard });
    Object.defineProperty(fake, 'offsetTop', { get: () => 0 });
    Object.defineProperty(window, 'visualViewport', { value: fake });
    (window as unknown as { __keyboard: (px: number) => void }).__keyboard = (px) => {
      keyboard = px;
      fake.dispatchEvent(new Event('resize'));
    };
  });
  for (const id of [short, long]) {
    await open(page, baseURL!, id);
    await page.locator('[data-splash-sheet] [data-add-field]').click();
    await page.evaluate(
      (px) => (window as unknown as { __keyboard: (px: number) => void }).__keyboard(px),
      KEYBOARD_PX,
    );
    await page.waitForTimeout(400);
    await page.locator('[data-splash-sheet] [data-add-field]').fill('Three\nshort\nlines');
    const b = await boxes(page);
    expect(b.room).toBe(844 - KEYBOARD_PX);
    // On the keyboard, Drop in reach, the sheet's top under the 56px band.
    expect(b.footer.bottom).toBeLessThanOrEqual(b.room + 1);
    expect(Math.abs(b.footer.bottom - b.sheet.bottom)).toBeLessThan(2);
    expect(b.sheet.top).toBeGreaterThanOrEqual(0);
    const drop = (await page.locator('[data-splash-sheet] [data-add-drop]').boundingBox())!;
    expect(drop.y + drop.height).toBeLessThanOrEqual(b.room);
    if (process.env.SHOT_DIR) {
      await page.screenshot({
        path: `${process.env.SHOT_DIR}/footer-keyboard-${id === short ? 'short' : 'long'}.png`,
      });
    }
    await page.evaluate(() =>
      (window as unknown as { __keyboard: (px: number) => void }).__keyboard(0),
    );
  }
});
