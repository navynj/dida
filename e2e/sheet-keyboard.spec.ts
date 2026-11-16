import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';

import { lanePath, poolPath } from '@/lib/routes';

import { asAdmin, asUser } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * Compose on a phone (H80) is the page sheet, from every ground that has
 * the compose disc on a phone: Home, a diary and the diary list (a lane's
 * page has it only in the wide rail, and there opens the same composer in
 * the post sheet's frame). With the keyboard up —
 * simulated by a visual viewport 340px shorter — the sheet keeps its 56px
 * band at the top, ends on the keyboard, and Save stays in reach; its ways
 * out ask *Discard this page?* once something is written. Two throwaway
 * people against the local stack (one in a diary of their own, one in
 * none, for the diary list), removed after with the diary.
 */
const admin = asAdmin();
const KEYBOARD_PX = 340;
const TOP_GAP_PX = 56;

type Person = { id: string; cookie: string };
let writer: Person = { id: '', cookie: '' };
let alone: Person = { id: '', cookie: '' };
let pool = '';
let lane = '';

async function person(name: string): Promise<Person> {
  const email = `sheet-keyboard-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  const id = made.data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
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
  return { id, cookie: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url') };
}

test.beforeAll(async () => {
  writer = await person('Kay');
  alone = await person('Solo');
  const made = await admin
    .from('my_categories')
    .insert({ user_id: writer.id, name: 'Day', icon: '🌊' })
    .select('id')
    .single();
  if (made.error) throw made.error;
  lane = made.data.id;
  await admin.from('my_categories').insert({ user_id: alone.id, name: 'Day', icon: '🌊' });
  const created = await asUser(writer.id).rpc('create_pool', {
    p_name: 'Our Pool',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Day', icon: '☀', my_category_id: null }],
    p_include_history: false,
  });
  if (created.error) throw created.error;
  pool = created.data!;
});

test.afterAll(async () => {
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const who of [writer, alone]) {
    if (!who.id) continue;
    await admin.from('splashes').delete().eq('owner_id', who.id);
    await admin.auth.admin.deleteUser(who.id);
  }
});

/** A visual viewport whose height the test sets, as a keyboard would. */
async function fakeKeyboard(page: Page): Promise<void> {
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
}

/** The sheet's box, and Save's, against the room the keyboard leaves. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-compose-sheet]')!.getBoundingClientRect();
    const save = document.querySelector('[data-draft-save]')!.getBoundingClientRect();
    return {
      top: sheet.top,
      bottom: sheet.bottom,
      saveTop: save.top,
      saveBottom: save.bottom,
      room: window.visualViewport!.height,
    };
  });
}

/** Two frames, for the sheet to take the size the viewport just gave it. */
const frames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

const GROUNDS = [
  { name: 'home', who: () => writer, path: () => '/' },
  { name: 'diary', who: () => writer, path: () => poolPath(pool) },
  { name: 'diary-list', who: () => alone, path: () => '/pool' },
] as const;

async function signIn(page: Page, baseURL: string, who: Person): Promise<void> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page
    .context()
    .addCookies([{ name: `sb-${ref}-auth-token`, value: who.cookie, url: baseURL }]);
}

test('a lane’s page composes in the post sheet’s frame on a wide screen, the same fields', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!, writer);
  await page.goto(lanePath(lane));
  if (info.project.name === 'phone') {
    // No compose disc on a lane's page on a phone: its foot is the wide rail's.
    await expect(page.locator('[data-lane-page], main').first()).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(1_000);
    await expect(page.locator('[data-compose]:visible')).toHaveCount(0);
    return;
  }
  const compose = page.locator('[data-compose]:visible').first();
  await expect(compose).toBeVisible({ timeout: 90_000 });
  const sheet = page.locator('[data-sheet-frame] [data-compose-sheet]');
  await expect(async () => {
    await compose.click();
    await expect(sheet).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.locator('[data-splash-modal]')).toHaveCount(0);
  const draft = sheet.locator('[data-draft-card]');
  await expect(draft.locator('[data-category-line]')).toBeVisible();
  await expect(draft.locator('[data-draft-save]')).toBeInViewport();
  // Wide, the same row searched in place: no popover.
  await draft.getByRole('button', { name: 'Search categories' }).click();
  await draft.getByRole('textbox', { name: 'Search categories' }).fill('da');
  await expect(draft.locator('[data-category-line] [data-pick-category]')).toHaveCount(1);
  await expect(page.locator('[role="dialog"][aria-label="Category"]')).toHaveCount(0);
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/category-search-desktop.png` });
  }
  await draft.getByRole('textbox', { name: 'Search categories' }).press('Escape');
  await expect(sheet).toBeVisible();
  await draft.getByLabel('Content').fill('a walk');
  await page
    .locator('[data-sheet-frame] > button[aria-label="Close"]')
    .click({ position: { x: 20, y: 20 } });
  await expect(draft.locator('[data-draft-confirm]')).toBeVisible();
  await draft.locator('[data-draft-discard]').click();
  await expect(sheet).toHaveCount(0);
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/compose-lane-desktop.png` });
  }
});

for (const ground of GROUNDS) {
  test(`compose on the ${ground.name} ground is the page sheet, Save in reach with the keyboard up`, async ({
    page,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== 'phone', 'a phone’s keyboard');
    test.setTimeout(120_000);
    await signIn(page, baseURL!, ground.who());
    await fakeKeyboard(page);
    await page.goto(ground.path());
    const compose = page.locator('[data-compose]:visible').first();
    await expect(compose).toBeVisible({ timeout: 90_000 });
    const sheet = page.locator('[data-splash-modal] [data-compose-sheet]');
    // Tapped again until the page has hydrated and the sheet answers.
    await expect(async () => {
      await compose.click();
      await expect(sheet).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    // The page sheet, not a card on the stack: its grabber, no draft seated.
    await expect(sheet.locator('[data-sheet-handle]')).toBeVisible();
    await expect(page.locator('[data-stack] [data-draft-card]')).toHaveCount(0);
    const draft = sheet.locator('[data-draft-card]');
    // The page's order (H80, ninth pass): date, title, category row, content, the foot.
    const tops = await Promise.all(
      [
        '[data-draft-header]',
        '[data-draft-title-row]',
        '[data-draft-category-row]',
        '[aria-label="Content"]',
        '[data-draft-footer]',
      ].map(async (selector) => (await draft.locator(selector).first().boundingBox())!.y),
    );
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    await expect(draft.locator('[data-draft-category]')).toHaveCount(0);

    // Content far taller than the room, then the keyboard.
    const body = draft.getByLabel('Content');
    await body.fill(Array.from({ length: 60 }, (_, n) => `Line ${n + 1}`).join('\n'));
    // Risen on the spring: settled when its top rests at the band, at full height.
    await expect
      .poll(async () => Math.round((await geometry(page)).top), { timeout: 5_000 })
      .toBe(TOP_GAP_PX);
    let at = await geometry(page);
    expect(at.saveBottom).toBeLessThanOrEqual(at.room);
    await body.focus();
    await page.evaluate(
      (px) => (window as unknown as { __keyboard: (px: number) => void }).__keyboard(px),
      KEYBOARD_PX,
    );
    await frames(page);
    at = await geometry(page);
    expect(at.room).toBe(844 - KEYBOARD_PX);
    expect(at.top).toBeGreaterThanOrEqual(TOP_GAP_PX - 0.5);
    expect(at.bottom).toBeLessThanOrEqual(at.room + 0.5);
    expect(at.saveTop).toBeGreaterThanOrEqual(at.top);
    expect(at.saveBottom).toBeLessThanOrEqual(at.room);
    await expect(draft.locator('[data-draft-save]')).toBeInViewport();
    if (process.env.SHOT_DIR) {
      await page.screenshot({ path: `${process.env.SHOT_DIR}/compose-${ground.name}-phone.png` });
    }

    // Searching categories with the keyboard up (H80, ninth pass): the row
    // turns into a field in place, above the keyboard, filtering the line.
    await draft.getByRole('button', { name: 'Search categories' }).click();
    const search = draft.getByRole('textbox', { name: 'Search categories' });
    await expect(search).toBeFocused();
    await search.fill('da');
    await frames(page);
    const row = (await draft.locator('[data-draft-category-row]').boundingBox())!;
    expect(row.y).toBeGreaterThanOrEqual(TOP_GAP_PX);
    expect(row.y + row.height).toBeLessThanOrEqual(844 - KEYBOARD_PX);
    await expect(draft.locator('[data-category-line] [data-pick-category]')).toHaveCount(1);
    await expect(page.locator('[role="dialog"][aria-label="Category"]')).toHaveCount(0);
    if (process.env.SHOT_DIR) {
      await page.screenshot({
        path: `${process.env.SHOT_DIR}/category-search-${ground.name}-phone.png`,
      });
    }
    await search.press('Escape');
    await expect(search).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(draft.locator('[data-draft-confirm]')).toHaveCount(0);

    // Written: the dimmed screen asks, Keep writing keeps it.
    await page
      .locator('[data-splash-modal] [data-sheet-scrim]')
      .click({ position: { x: 20, y: 20 } });
    await expect(draft.locator('[data-draft-confirm]')).toBeVisible();
    await draft.locator('[data-draft-keep]').click();
    await expect(sheet).toBeVisible();
    // A drag down by the grabber asks too.
    const handle = (await sheet.locator('[data-sheet-handle]').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 2);
    await page.mouse.down();
    for (let k = 1; k <= 10; k += 1) {
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 2 + k * 25);
    }
    await page.mouse.up();
    await expect(draft.locator('[data-draft-confirm]')).toBeVisible();
    await draft.locator('[data-draft-discard]').click();
    await expect(sheet).toHaveCount(0);
  });
}
