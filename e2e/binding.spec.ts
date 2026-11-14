import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

config({ path: '.env.local', quiet: true });

/**
 * The spiral binding (H81), in a real browser: the coils rise over the top
 * card's edge, but the read card's bookmark above stays its own — its label
 * is where a tap lands. A throwaway person with three posts, against the
 * local stack; both are removed after.
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
  const email = `binding-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
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

test('the read card’s label sits above the coils, and is where a tap lands', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  await page.goto('/');
  const stack = page.locator('[data-stack]');
  await expect(stack).toBeVisible({ timeout: 60_000 });
  // Home holds live connections open, so it is never network-idle: a moment to hydrate.
  await page.waitForTimeout(1_500);

  // The coils, and the holes in the top card's face that they thread.
  await expect(page.locator('[data-binding="front"] [data-coil]').first()).toBeAttached();
  const top = page.locator('[data-stack-card][data-slot="0"]');
  await expect(top).toHaveAttribute('data-stack-card', posts.near);
  const mask = await top
    .locator('> div')
    .first()
    .evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
  expect(mask).toContain('radial-gradient');

  // One flip forward: near is read, above the top card.
  await page.locator('[data-step-card]').first().click();
  const read = page.locator('[data-stack-card][data-stair="up"]');
  await expect(read).toHaveAttribute('data-stack-card', posts.near);
  await expect(page.locator('[data-moving]')).toHaveCount(0);

  const label = await read.locator('[data-card-title]').boundingBox();
  const front = await page.locator('[data-binding="front"]').boundingBox();
  expect(label).not.toBeNull();
  // Wholly above the coils' top.
  expect(label!.y + label!.height).toBeLessThanOrEqual(front!.y + 0.5);
  const hit = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x, y)
        ?.closest('[data-step-card]')
        ?.getAttribute('data-step-card') ?? null,
    [label!.x + label!.width / 2, label!.y + label!.height / 2],
  );
  expect(hit).toBe(posts.near);
});
