import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

config({ path: '.env.local', quiet: true });

/**
 * The draft card (H80), in a real browser: compose opens a page on the
 * stack, not a sheet; a date set to an older day moves it to its slot
 * among the posts; Save leaves it where it is, out of edit mode, its piece
 * playing the drop — and asks the server once, the action alone. A
 * throwaway person with three posts, against the local stack; both are
 * removed after.
 */
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const ZONE = 'America/Vancouver';

/** A day `back` days before today, in the person's zone. */
function daysAgo(back: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
  const at = new Date(`${today}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - back);
  return at.toISOString().slice(0, 10);
}

let user = '';
let cookie = '';
const posts: Record<string, string> = {};

test.beforeAll(async () => {
  const email = `draft-card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  user = made.data.user.id;
  await admin.from('profiles').insert({ id: user, display_name: 'Writer', timezone: ZONE });
  const lane = await admin
    .from('my_categories')
    .insert({ user_id: user, name: 'Walks', icon: '🚶' })
    .select('id')
    .single();
  if (lane.error) throw lane.error;
  // A second category, for the picker's search to filter out.
  await admin.from('my_categories').insert({ user_id: user, name: 'Reading', icon: '📖' });
  for (const [name, back] of [
    ['near', 1],
    ['middle', 5],
    ['far', 10],
  ] as const) {
    const post = await admin
      .from('splashes')
      .insert({
        owner_id: user,
        created_by: user,
        title: name,
        declared_start: daysAgo(back),
        declared_lane_id: lane.data.id,
      })
      .select('id')
      .single();
    if (post.error) throw post.error;
    posts[name] = post.data.id;
  }

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
  cookie = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
});

test.afterAll(async () => {
  if (user) await admin.from('splashes').delete().eq('owner_id', user);
  if (user) await admin.auth.admin.deleteUser(user);
});

async function signIn(page: Page, baseURL: string): Promise<void> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL }]);
}

test('compose writes on the stack: the draft moves to its date, Save keeps it there, one write', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  // Which date inputs had their picker opened: a native picker draws
  // outside the page, so the call is what can be seen.
  await page.addInitScript(() => {
    const opened: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = opened;
    HTMLInputElement.prototype.showPicker = function (this: HTMLInputElement) {
      opened.push(this.getAttribute('aria-label') ?? '');
    };
  });
  await page.goto('/');
  const stack = page.locator('[data-stack]');
  await expect(stack).toBeVisible({ timeout: 60_000 });
  // Home holds live connections open, so it is never network-idle: a moment to hydrate.
  await page.waitForTimeout(1_500);

  await page.locator('[data-compose]:visible').first().click();
  const draft = page.locator('[data-draft-card]');
  await expect(draft).toBeVisible();
  // A page on the stack, not a sheet.
  await expect(page.locator('[data-splash-sheet]')).toHaveCount(0);
  const id = (await draft.getAttribute('data-draft-card'))!;
  const top = page.locator('[data-stack-card][data-slot="0"]');
  await expect(top).toHaveAttribute('data-stack-card', id);

  // `…` ends the icon-and-title row, as on the finished card; no row of its own.
  await expect(draft.locator('[data-draft-title-row] [data-compose-more]')).toBeVisible();
  await expect(draft.locator('[data-draft-top]')).toHaveCount(0);
  // Where it is shared, one row: no diary to share to, so the status alone.
  await expect(draft.locator('[data-share-to] [data-share-private]')).toHaveText('Only you');
  await expect(draft).not.toContainText('Only you can see this');
  await draft.locator('[aria-label="Content"]').fill('the tide was out');
  // The category picker: a search field always, filtering the chips as typed.
  await draft.locator('[data-draft-category]').click();
  const picker = page.locator('[role="dialog"][aria-label="Category"]');
  await expect(picker).toBeVisible();
  const chips = picker.locator('[role="group"][aria-label="Category"]');
  await expect(chips).toContainText('Walks');
  await expect(chips).toContainText('Reading');
  await picker.getByPlaceholder('Search categories').fill('wal');
  await expect(chips).toContainText('Walks');
  await expect(chips).not.toContainText('Reading');
  await chips.getByRole('button', { name: /Walks/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(draft.locator('[data-draft-category]')).toContainText('Walks');

  // Seven days back: between middle (5) and far (10). One tap on the date
  // opens its picker itself, no panel between; the day is then chosen there.
  await draft.locator('[data-draft-date]').click();
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual(
    ['Date'],
  );
  await expect(page.locator('[role="dialog"][aria-label="Date"]')).toHaveCount(0);
  await draft.locator('input[aria-label="Date"]').fill(daysAgo(7));
  await expect(page.locator('[data-stack-card][data-stair="up"]')).toHaveAttribute(
    'data-stack-card',
    posts.middle,
  );
  await expect(top).toHaveAttribute('data-stack-card', id);
  await expect(page.locator('[data-stack-card][data-stair="down"][data-step="1"]')).toHaveAttribute(
    'data-stack-card',
    posts.far,
  );

  // Every request from here: the action, and any render that is not a prefetch.
  const asked: string[] = [];
  page.on('request', (request) => {
    const headers = request.headers();
    if (headers['next-action']) asked.push('action');
    else if (headers.rsc && !headers['next-router-prefetch']) asked.push('render');
  });
  const answered = page.waitForResponse(
    (response) => !!response.request().headers()['next-action'],
  );
  await draft.locator('[data-draft-save]').click();
  // Out of edit mode at once, in the same seat.
  await expect(page.locator('[data-draft-card]')).toHaveCount(0);
  await expect(top).toHaveAttribute('data-stack-card', id);
  await expect(page.locator('[data-stack-card][data-stair="up"]')).toHaveAttribute(
    'data-stack-card',
    posts.middle,
  );
  // Its piece on the Calendar plays the drop once.
  await expect(
    page
      .locator(`[data-board-piece="${id}"] .board-plunge, [data-board-piece="${id}"] .board-bob`)
      .first(),
  ).toBeAttached();
  await answered;
  // Long enough for a refresh after the action to have gone out.
  await page.waitForTimeout(1_500);
  expect(asked).toEqual(['action']);

  const { data } = await admin.from('splashes').select('declared_start').eq('id', id).single();
  expect(data?.declared_start).toBe(daysAgo(7));
  // Still where it was, with the real row in.
  await expect(top).toHaveAttribute('data-stack-card', id);
});
