import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

import { asUser } from '../tests/as-user';

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
  // No diary to share to: no Share to, the full private sentence (H75).
  await expect(draft.locator('[data-share-to]')).toHaveText('Only you can see this');
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

/**
 * Share to with many diaries (H80, H75): one summary row on the card, which
 * never reflows as they grow, and the diaries in a picker it opens. Another
 * throwaway person, in six pools of their own; all removed after.
 */
test.describe('Share to with six diaries', () => {
  const NAMES = ['test', 'Crew', 'Our Pool', 'Family', 'Book club', 'Work friends'];
  let sharer = '';
  let sharerCookie = '';
  const pools: string[] = [];

  test.beforeAll(async () => {
    const email = `draft-share-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
    const made = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (made.error) throw made.error;
    sharer = made.data.user.id;
    await admin.from('profiles').insert({ id: sharer, display_name: 'Sharer', timezone: ZONE });
    await admin.from('my_categories').insert({ user_id: sharer, name: 'Walks', icon: '🚶' });
    for (const name of NAMES) {
      const pool = await asUser(sharer).rpc('create_pool', {
        p_name: name,
        p_kind: null as unknown as 'friends',
        p_lanes: [
          { name: 'Trips', icon: '🏕', my_category_id: null },
          { name: 'Food', icon: '🍜', my_category_id: null },
        ],
        p_include_history: false,
      });
      if (pool.error) throw pool.error;
      pools.push(pool.data!);
    }
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error) throw link.error;
    const verified = await fetch(link.data.properties.action_link, { redirect: 'manual' });
    const hash = new URLSearchParams(verified.headers.get('location')!.split('#')[1]);
    sharerCookie =
      'base64-' +
      Buffer.from(
        JSON.stringify({
          access_token: hash.get('access_token'),
          refresh_token: hash.get('refresh_token'),
          token_type: 'bearer',
          expires_in: Number(hash.get('expires_in')),
          expires_at: Number(hash.get('expires_at')),
          user: made.data.user,
        }),
      ).toString('base64url');
  });

  test.afterAll(async () => {
    for (const pool of pools) await admin.from('pools').delete().eq('id', pool);
    if (sharer) await admin.from('splashes').delete().eq('owner_id', sharer);
    if (sharer) await admin.auth.admin.deleteUser(sharer);
  });

  test('one summary row opens the diaries’ picker; four on read as names and +N, on one line', async ({
    page,
    baseURL,
  }, info) => {
    test.setTimeout(120_000);
    const phone = info.project.name === 'phone';
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
    await page
      .context()
      .addCookies([{ name: `sb-${ref}-auth-token`, value: sharerCookie, url: baseURL! }]);
    // A visual viewport the test shortens, as the keyboard does (sheet-keyboard.spec.ts).
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
    await page.goto('/');
    // No posts yet: no stack to wait for, the compose disc.
    const compose = page.locator('[data-compose]:visible').first();
    await expect(compose).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
    await compose.click();
    const draft = page.locator('[data-draft-card]');
    await expect(draft).toBeVisible();
    if (phone)
      await page.evaluate(() =>
        (window as unknown as { __keyboard: (px: number) => void }).__keyboard(340),
      );
    await draft.locator('[aria-label="Content"]').fill('six diaries');

    // On the card: one row, no pool chips, whatever their number.
    const row = draft.locator('[data-share-to]');
    await expect(row).toHaveText(/^Share to\s*Not shared yet$/);
    await expect(draft.locator('[data-share-pool]')).toHaveCount(0);
    const before = (await row.boundingBox())!;
    expect(before.height).toBeLessThan(32);

    await row.click();
    const picker = page.locator('[role="dialog"][aria-label="Share to"]');
    await expect(picker).toBeVisible();
    // The search field always, then every diary as a chip.
    await expect(picker.getByPlaceholder('Search diaries')).toBeVisible();
    await expect(picker.locator('[data-share-pool]')).toHaveCount(NAMES.length);
    if (phone) {
      // A bottom sheet, on the keyboard.
      await expect(picker.locator('xpath=ancestor-or-self::*[@data-sheet-frame]')).toHaveCount(1);
    } else {
      // A popover, opening up into the card, the row under it.
      const box = (await picker.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(before.y + 1);
    }
    // Risen (sheet-rise), it ends on the keyboard, not under it.
    const room = await page.evaluate(() => window.visualViewport!.height);
    await expect
      .poll(async () => {
        const box = (await picker.boundingBox())!;
        return box.y + box.height <= room + 1;
      })
      .toBe(true);

    await picker.getByPlaceholder('Search diaries').fill('cl');
    await expect(picker.locator('[data-share-pool]')).toHaveCount(1);
    await expect(picker.locator('[data-share-pool]')).toContainText('Book club');
    await picker.getByPlaceholder('Search diaries').fill('');
    for (const name of ['Work friends', 'test', 'Crew', 'Family']) {
      // Off, the chip is the button.
      await picker.locator('[data-share-pool]', { hasText: name }).click();
    }
    // Multi-select: still open, four in ink, each on a lane at once with its chip.
    await expect(picker.locator('[data-share-pool][data-on]')).toHaveCount(4);
    await expect(picker.locator('[data-share-pool][data-on] [data-share-lane]')).toHaveCount(4);
    // A lane changed inside the picker.
    const crew = picker.locator('[data-share-pool][data-on]', { hasText: 'Crew' });
    await crew.locator('[data-share-lane]').click();
    const lanes = picker.locator('[data-share-lanes]');
    await expect(lanes).toContainText('Category in Crew');
    await lanes.getByRole('button', { name: /Food/ }).click();
    await expect(crew.locator('[data-share-lane]')).toContainText('Food');
    if (process.env.SHOT_DIR) {
      await page.screenshot({
        path: `${process.env.SHOT_DIR}/share-picker-${info.project.name}.png`,
      });
    }

    // Esc closes the picker, not the draft.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(draft).toBeVisible();
    // The row: names, comma-separated, +N for the rest, on the same one line.
    await expect(row.locator('[data-share-private]')).toHaveCount(0);
    const summary = row.locator('[data-share-summary]');
    await expect(summary).toContainText(',');
    // A phone's row is too narrow for four names: the rest as +N.
    if (phone) await expect(row.locator('[data-share-more]')).toHaveText(/^\+\d$/);
    const after = (await row.boundingBox())!;
    expect(Math.abs(after.height - before.height)).toBeLessThan(2);
    const card = (await draft.boundingBox())!;
    expect(after.x + after.width).toBeLessThanOrEqual(card.x + card.width);
    // Every one counted, named or in +N; the hidden ruler's copies not.
    const shown = await summary.locator('[data-share-named]').count();
    const more = (await row.locator('[data-share-more]').count())
      ? Number((await row.locator('[data-share-more]').textContent())!.slice(1))
      : 0;
    expect(shown + more).toBe(4);
    // Save still in reach above the keyboard.
    const save = (await draft.locator('[data-draft-save]').boundingBox())!;
    expect(save.y + save.height).toBeLessThanOrEqual(
      await page.evaluate(() => window.visualViewport!.height),
    );
    if (process.env.SHOT_DIR) {
      await page.screenshot({ path: `${process.env.SHOT_DIR}/share-row-${info.project.name}.png` });
    }

    // Saved, it is shared to the four, Crew on the lane picked by hand.
    await draft.locator('[data-draft-save]').click();
    await expect(page.locator('[data-draft-card]')).toHaveCount(0);
    const placed = async () => {
      const { data } = await admin
        .from('splash_placements')
        .select('pool_id, pool_lane_id, shared, splashes!inner(owner_id)')
        .eq('splashes.owner_id', sharer);
      return (data ?? []).filter((p) => p.shared);
    };
    await expect.poll(async () => (await placed()).length).toBe(4);
    const named = (name: string) => pools[NAMES.indexOf(name)];
    expect(new Set((await placed()).map((p) => p.pool_id))).toEqual(
      new Set(['Work friends', 'test', 'Crew', 'Family'].map(named)),
    );
    const food = await admin
      .from('pool_lanes')
      .select('id')
      .eq('pool_id', named('Crew'))
      .eq('name', 'Food')
      .single();
    expect((await placed()).find((p) => p.pool_id === named('Crew'))?.pool_lane_id).toBe(
      food.data?.id,
    );
  });
});
