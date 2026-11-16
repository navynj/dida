import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

import { asUser } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * The draft card (H80), in a real browser. On a wide screen compose opens a
 * page on the stack, not a sheet; a date set to an older day moves it to
 * its slot among the posts. On a phone it opens the page sheet with the
 * same fields, and nothing is seated until Save. Either way Save seats the
 * post by its date on top, out of edit mode, its piece playing the drop —
 * and asks the server once, the action alone. A throwaway person with three
 * posts, against the local stack; both are removed after.
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

test('compose writes on the stack (wide) or the page sheet (phone); Save seats it by its date, one write', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  const phone = info.project.name === 'phone';
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
  const id = (await draft.getAttribute('data-draft-card'))!;
  const top = page.locator('[data-stack-card][data-slot="0"]');
  if (phone) {
    // The page sheet, its grabber; the stack is left as it was.
    await expect(
      page.locator('[data-splash-modal] [data-compose-sheet] [data-draft-card]'),
    ).toBeVisible();
    await expect(page.locator('[data-sheet-handle]')).toBeVisible();
    await expect(page.locator('[data-stack] [data-draft-card]')).toHaveCount(0);
    await expect(top).toHaveAttribute('data-stack-card', posts.near);
  } else {
    // A page on the stack, not a sheet.
    await expect(page.locator('[data-splash-sheet]')).toHaveCount(0);
    await expect(top).toHaveAttribute('data-stack-card', id);
  }

  // The page's skeleton (H80, ninth pass): `…` ends the date's row.
  await expect(draft.locator('[data-draft-header] [data-compose-more]')).toBeVisible();
  await expect(draft.locator('[data-draft-top]')).toHaveCount(0);
  // No diary to share to: no Share to row at all, no private marker (H78d).
  await expect(draft.locator('[data-share-to]')).toHaveCount(0);
  await expect(draft).not.toContainText('Only you can see this');
  await draft.locator('[aria-label="Content"]').fill('the tide was out');
  // The category row: every category on one line, searched in place.
  const chips = draft.locator('[data-category-line]');
  await expect(chips).toContainText('Walks');
  await expect(chips).toContainText('Reading');
  await draft.getByRole('button', { name: 'Search categories' }).click();
  const search = draft.getByRole('textbox', { name: 'Search categories' });
  await expect(search).toBeFocused();
  await search.fill('wal');
  await expect(chips).toContainText('Walks');
  await expect(chips).not.toContainText('Reading');
  await chips.getByRole('button', { name: /Walks/ }).click();
  await search.press('Escape');
  // The search closed, the choice kept and first; the draft still open.
  await expect(search).toHaveCount(0);
  await expect(draft).toBeVisible();
  await expect(chips.locator('[data-pick-category]').first()).toContainText('Walks');
  await expect(chips.locator('[data-pick-category]').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[role="dialog"][aria-label="Category"]')).toHaveCount(0);

  // Seven days back: between middle (5) and far (10). One tap on the date
  // opens its picker itself, no panel between; the day is then chosen there.
  await draft.locator('[data-draft-date]').click();
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual(
    ['Date'],
  );
  await expect(page.locator('[role="dialog"][aria-label="Date"]')).toHaveCount(0);
  await draft.locator('input[aria-label="Date"]').fill(daysAgo(7));
  if (!phone) {
    await expect(page.locator('[data-stack-card][data-stair="up"]')).toHaveAttribute(
      'data-stack-card',
      posts.middle,
    );
    await expect(top).toHaveAttribute('data-stack-card', id);
    await expect(
      page.locator('[data-stack-card][data-stair="down"][data-step="1"]'),
    ).toHaveAttribute('data-stack-card', posts.far);
  }

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
  // Out of edit mode at once — the sheet gone on a phone — seated by its
  // date and on top: middle read above it, far the next below.
  await expect(page.locator('[data-draft-card]')).toHaveCount(0);
  await expect(page.locator('[data-compose-sheet]')).toHaveCount(0);
  await expect(top).toHaveAttribute('data-stack-card', id);
  await expect(page.locator('[data-stack-card][data-stair="up"]')).toHaveAttribute(
    'data-stack-card',
    posts.middle,
  );
  await expect(page.locator('[data-stack-card][data-stair="down"][data-step="1"]')).toHaveAttribute(
    'data-stack-card',
    posts.far,
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
 * Share to on one line (H80, H75): the diaries in view as "+" chips, never
 * wrapping; those on first, in ink; "+N" for the rest, opening the picker.
 * A throwaway person in 1, 2 and 6 pools of their own, each removed after.
 */
const NAMES = ['test', 'Crew', 'Our Pool', 'Family', 'Book club', 'Work friends'];

for (const count of [1, 2, 6]) {
  test.describe(`Share to with ${count} ${count === 1 ? 'diary' : 'diaries'}`, () => {
    const names = NAMES.slice(0, count);
    let sharer = '';
    let sharerCookie = '';
    const pools: string[] = [];

    test.beforeAll(async () => {
      const email = `draft-share-${count}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
      const made = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (made.error) throw made.error;
      sharer = made.data.user.id;
      await admin.from('profiles').insert({ id: sharer, display_name: 'Sharer', timezone: ZONE });
      await admin.from('my_categories').insert({ user_id: sharer, name: 'Walks', icon: '🚶' });
      for (const name of names) {
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

    test('the diaries as "+" chips on one line, those on first; +N opens the picker', async ({
      page,
      baseURL,
    }, info) => {
      test.setTimeout(120_000);
      const phone = info.project.name === 'phone';
      const shot = async (what: string): Promise<void> => {
        if (!process.env.SHOT_DIR) return;
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/share-${what}-${count}-${info.project.name}.png`,
        });
      };
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
      if (phone) {
        await page.evaluate(() =>
          (window as unknown as { __keyboard: (px: number) => void }).__keyboard(340),
        );
      }
      await draft.locator('[aria-label="Content"]').fill(`${count} diaries`);

      const row = draft.locator('[data-share-to]');
      const line = row.locator('[data-share-line]');
      const chips = line.locator('[data-share-pool]');
      const more = line.locator('[data-share-more]');
      /** On one line: every chip and +N at one top, inside the card, the row one chip high. */
      const oneLine = async (): Promise<number> => {
        const tops = await line
          .locator('[data-share-pool], [data-share-more]')
          .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
        expect(new Set(tops).size).toBe(1);
        const box = (await row.boundingBox())!;
        const card = (await draft.boundingBox())!;
        expect(box.height).toBeLessThan(36);
        const right = await line
          .locator('[data-share-pool], [data-share-more]')
          .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
        expect(right).toBeLessThanOrEqual(card.x + card.width);
        // Every diary counted: on the line or in +N.
        const hidden = (await more.count()) ? Number((await more.textContent())!.slice(1)) : 0;
        expect((await chips.count()) + hidden).toBe(count);
        return hidden;
      };

      // Nothing on: every chip on the line a "+" offer, no status sentence.
      await expect(row).not.toContainText('Not shared yet');
      for (const text of await chips.allTextContents()) expect(text.startsWith('+')).toBe(true);
      const hiddenAtFirst = await oneLine();
      if (count === 6 && phone) expect(hiddenAtFirst).toBeGreaterThan(0);
      if (count < 6) expect(hiddenAtFirst).toBe(0);
      await shot('line');

      let turnedOn: string[];
      if (count < 6) {
        // From the line itself: "+ name" turns it on, ink, first.
        turnedOn = names;
        for (const name of turnedOn) {
          await chips.filter({ hasText: name }).first().click();
          // Turned on, it moves to the front: settled before the next tap.
          await expect(line.locator('[data-share-pool][data-on]', { hasText: name })).toBeVisible();
        }
        await expect(line.locator('[data-share-pool][data-on]')).toHaveCount(count);
        // The lane chip on the line opens the picker on that diary's lanes.
        await line
          .locator('[data-share-pool][data-on]', { hasText: 'test' })
          .locator('[data-share-lane]')
          .click();
      } else {
        // From the picker, through +N: search, then two turned on.
        await more.click();
        const picker = page.locator('[role="dialog"][aria-label="Share to"]');
        await picker.getByPlaceholder('Search diaries').fill('cl');
        await expect(picker.locator('[data-share-pool]')).toHaveCount(1);
        await picker.getByPlaceholder('Search diaries').fill('');
        turnedOn = ['Work friends', 'Family'];
        for (const name of turnedOn) {
          await picker.locator('[data-share-pool]', { hasText: name }).click();
        }
        await picker
          .locator('[data-share-pool][data-on]', { hasText: 'Family' })
          .locator('[data-share-lane]')
          .click();
      }
      const picker = page.locator('[role="dialog"][aria-label="Share to"]');
      await expect(picker).toBeVisible();
      await expect(picker.getByPlaceholder('Search diaries')).toBeVisible();
      const lanes = picker.locator('[data-share-lanes]');
      await lanes.getByRole('button', { name: /Food/ }).click();
      await expect(lanes).toHaveCount(0);
      // Risen (sheet-rise), the picker ends on the keyboard, not under it.
      const room = await page.evaluate(() => window.visualViewport!.height);
      await expect
        .poll(async () => {
          const box = (await picker.boundingBox())!;
          return box.y + box.height <= room + 1;
        })
        .toBe(true);
      await shot('picker');
      // Esc closes the picker, not the draft.
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect(draft).toBeVisible();

      // What is on comes first on the line, in ink, never behind +N.
      const on = turnedOn.length;
      const first = await chips.evaluateAll(
        (els, n) => els.slice(0, n).map((el) => el.hasAttribute('data-on')),
        on,
      );
      expect(first).toEqual(Array(on).fill(true));
      for (const name of turnedOn) {
        const chip = line.locator('[data-share-pool][data-on]', { hasText: name });
        await expect(chip).toBeVisible();
        expect((await chip.textContent())!.startsWith('+')).toBe(false);
      }
      await oneLine();
      const save = (await draft.locator('[data-draft-save]').boundingBox())!;
      expect(save.y + save.height).toBeLessThanOrEqual(room);
      await shot('on');

      // Saved, it is placed in the diaries turned on, the lane picked by hand kept.
      await draft.locator('[data-draft-save]').click();
      await expect(page.locator('[data-draft-card]')).toHaveCount(0);
      const placed = async () => {
        const { data } = await admin
          .from('splash_placements')
          .select('pool_id, pool_lane_id, shared, splashes!inner(owner_id)')
          .eq('splashes.owner_id', sharer);
        return (data ?? []).filter((p) => p.shared);
      };
      await expect.poll(async () => (await placed()).length).toBe(on);
      const named = (name: string) => pools[names.indexOf(name)];
      expect(new Set((await placed()).map((p) => p.pool_id))).toEqual(new Set(turnedOn.map(named)));
      const byHand = count < 6 ? 'test' : 'Family';
      const food = await admin
        .from('pool_lanes')
        .select('id')
        .eq('pool_id', named(byHand))
        .eq('name', 'Food')
        .single();
      expect((await placed()).find((p) => p.pool_id === named(byHand))?.pool_lane_id).toBe(
        food.data?.id,
      );
    });
  });
}
