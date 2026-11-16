import { config } from 'dotenv';
import { expect, test } from '@playwright/test';

import { splashPath } from '@/lib/routes';

import { asAdmin, asUser } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * Audience on a wide screen (H75, wide): a popover anchored under *Share*
 * on a private page of mine, in the page panel — no dimmed screen, no
 * sheet. A switch shares at once; Escape closes it and focus is back on
 * Share; the page under it stays open. One throwaway person with a diary
 * of their own and a private page, against the local stack, removed after.
 */
const admin = asAdmin();
let me = { id: '', cookie: '' };
let pool = '';
let page_ = '';

test.beforeAll(async () => {
  const email = `audience-popover-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
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
  const created = await asUser(id).rpc('create_pool', {
    p_name: 'Our Pool',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Day', icon: '☀', my_category_id: null }],
    p_include_history: false,
  });
  if (created.error) throw created.error;
  pool = created.data!;
  page_ = crypto.randomUUID();
  const splash = await admin.from('splashes').insert({
    id: page_,
    owner_id: id,
    title: 'A quiet morning',
    declared_start: '2026-11-13',
    declared_lane_id: lane.data.id,
  });
  if (splash.error) throw splash.error;
  await admin
    .from('ripples')
    .insert({ author_id: id, note: 'Coffee by the window.', splash_id: page_ });
});

test.afterAll(async () => {
  if (pool) await admin.from('pools').delete().eq('id', pool);
  if (me.id) {
    await admin.from('splashes').delete().eq('owner_id', me.id);
    await admin.auth.admin.deleteUser(me.id);
  }
});

test('Audience opens as a popover under Share on a wide screen; Escape gives focus back', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'a wide screen');
  test.setTimeout(120_000);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page
    .context()
    .addCookies([{ name: `sb-${ref}-auth-token`, value: me.cookie, url: baseURL! }]);
  await page.goto(splashPath(page_));
  const header = page.locator('[data-splash-header]').first();
  const share = header.getByRole('button', { name: 'Share: Only me' });
  await expect(share).toBeVisible({ timeout: 90_000 });
  const popover = page.locator('[data-audience-popover]');
  // The page panel's own backdrop is there already; the popover adds none.
  const scrims = page.locator('[data-sheet-scrim]:visible');
  const before = await scrims.count();
  // Tapped again until the page has hydrated and the popover answers.
  await expect(async () => {
    await share.click();
    await expect(popover).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  // Under Share, right-aligned to it, inside the page panel; nothing dimmed.
  const at = (await share.boundingBox())!;
  const box = (await popover.boundingBox())!;
  expect(box.y).toBeGreaterThan(at.y + at.height - 1);
  expect(Math.abs(box.x + box.width - (at.x + at.width))).toBeLessThan(2);
  expect(box.width).toBeGreaterThan(300);
  expect(box.width).toBeLessThan(340);
  await expect(scrims).toHaveCount(before);
  await expect(page.locator('[data-audience-done], [data-sheet-frame]')).toHaveCount(0);
  await expect(popover).toContainText('Every note on this page follows it.');
  await expect(popover.locator('[data-audience-name]')).toHaveText(['Our Pool']);
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/audience-popover-desktop.png` });
  }

  // Keyboard: Tab to the row's switch, Space shares at once.
  await page.keyboard.press('Tab');
  const toggle = popover.getByRole('switch', { name: 'Shared to Our Pool' });
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(popover.locator('[data-audience-lanes]')).toBeVisible();
  await expect(header.locator('[data-audience-chip]')).toContainText('Our Pool');

  // Escape: the popover goes, the page stays, focus is on the chip that opened it.
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(page.locator('[data-splash-header]').first()).toBeVisible();
  await expect(header.locator('[data-audience-chip]')).toBeFocused();
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/audience-shared-desktop.png` });
  }

  // Written to the database: shared to the diary.
  await expect
    .poll(
      async () =>
        (await admin.from('splash_placements').select('pool_id').eq('splash_id', page_)).data
          ?.length,
    )
    .toBe(1);
});
