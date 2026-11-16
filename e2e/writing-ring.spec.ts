import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';

import { splashPath } from '@/lib/routes';

import { asAdmin } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * No ring on a free-text writing field (H78n, `.writing-field`): a key that
 * selects text (Shift+arrow) marks the keyboard, and the global ring drew
 * two lines across the composer's card. The caret shows focus there; the
 * buttons beside it keep the ring. The composer (the phone's sheet, the
 * wide draft card) and a page's add row and block editor. One throwaway
 * person with one page, against the local stack, removed after.
 */
const admin = asAdmin();
let me = { id: '', cookie: '' };
let page_ = '';

test.beforeAll(async () => {
  const email = `writing-ring-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
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
  page_ = crypto.randomUUID();
  const splash = await admin.from('splashes').insert({
    id: page_,
    owner_id: id,
    title: 'A quiet morning',
    declared_start: '2026-11-13',
    declared_lane_id: lane.data.id,
  });
  if (splash.error) throw splash.error;
  const note = await admin
    .from('ripples')
    .insert({ author_id: id, note: 'Coffee by the window.', splash_id: page_ });
  if (note.error) throw note.error;
});

test.afterAll(async () => {
  if (me.id) {
    await admin.from('splashes').delete().eq('owner_id', me.id);
    await admin.auth.admin.deleteUser(me.id);
  }
});

async function signIn(page: Page, baseURL: string): Promise<void> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page
    .context()
    .addCookies([{ name: `sb-${ref}-auth-token`, value: me.cookie, url: baseURL }]);
}

/** The focused element's outline, and whether the keyboard mark is up. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return {
      tag: el.tagName,
      outline: getComputedStyle(el).outlineStyle,
      keyboard: document.documentElement.hasAttribute('data-keyboard'),
    };
  });

/** Words typed, then a selection made by key: the keyboard's mark, no ring. */
async function selectByKey(page: Page, words: string): Promise<void> {
  await page.keyboard.type(words);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  const f = await focused(page);
  expect(f.tag).toBe('TEXTAREA');
  expect(f.keyboard).toBe(true);
  expect(f.outline).toBe('none');
}

test('the composer’s title and content draw no ring under keyboard selection; its buttons do', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  await page.goto('/');
  const compose = page.locator('[data-compose]:visible').first();
  await expect(compose).toBeVisible({ timeout: 90_000 });
  const draft = page.locator('[data-draft-card]');
  await expect(async () => {
    await compose.click();
    await expect(draft).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  if (info.project.name === 'phone') {
    await expect(
      page.locator('[data-splash-modal] [data-compose-sheet] [data-draft-card]'),
    ).toBeVisible();
  }
  await draft.getByLabel('Content').click();
  await selectByKey(page, 'a walk by the sea');
  await draft.getByRole('textbox', { name: 'Title' }).click();
  await selectByKey(page, 'Sea');
  if (process.env.SHOT_DIR) {
    await page.screenshot({
      path: `${process.env.SHOT_DIR}/writing-ring-${info.project.name}.png`,
    });
  }
  // Tab on to a button: the ring is still the keyboard's there.
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    const f = await focused(page);
    if (f.tag === 'BUTTON') {
      expect(f.outline).toBe('solid');
      return;
    }
  }
  throw new Error('no button reached by Tab');
});

test('a page’s add row and block editor draw no ring under keyboard selection', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  await page.goto(splashPath(page_));
  const add = page.locator('[data-splash-sheet] [data-add-field]');
  await expect(add).toBeVisible({ timeout: 90_000 });
  await add.click();
  await selectByKey(page, 'later, rain');
  await page.keyboard.press('Escape');
  await page.locator('[data-splash-sheet] button[data-block]').first().click();
  const block = page.locator('[data-splash-sheet] [data-block-field]');
  await expect(block).toBeFocused();
  await page.keyboard.press('End');
  await selectByKey(page, ' and toast');
});
