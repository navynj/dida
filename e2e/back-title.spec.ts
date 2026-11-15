import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

config({ path: '.env.local', quiet: true });

/**
 * A back card's title on the stack's steps (H82), in a real browser: on
 * each of the three steps below the top card, the title's computed colour
 * against its card's computed fill is 4.5:1 or better, on the light, pastel
 * and dark grounds. The read card above the top: its label's computed
 * colour against its glass — white and any smoke (H82) composited over the
 * ground — is 4.5:1 or better too. A throwaway person with five posts,
 * against the local stack; both are removed after. One person, so the
 * themes run in turn.
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

test.describe.configure({ mode: 'serial' });
// Wide enough for the stair's three lower steps; a phone's stair shows one.
test.use({ viewport: { width: 1280, height: 900 } });

let user = '';
let cookie = '';

test.beforeAll(async () => {
  const email = `back-title-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
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
    ['one', 1],
    ['two', 2],
    ['three', 3],
    ['four', 4],
    ['five', 5],
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

/** WCAG contrast of two `rgb(…)` colours. */
function contrast(a: string, b: string): number {
  const lum = (c: string): number => {
    const [r, g, bl] = c
      .match(/\d+(\.\d+)?/g)!
      .slice(0, 3)
      .map((v) => {
        const s = Number(v) / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The themes whose titles fell furthest under 4.5:1 on the steps (H82).
for (const [color, mode] of [
  ['yellow', 'light'],
  ['yellow', 'pastel'],
  ['yellow', 'dark'],
  ['pink', 'light'],
  ['blue', 'pastel'],
  ['black', 'pastel'],
] as const) {
  test(`a back card’s title reads at 4.5:1 on every step: ${color} ${mode}`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await admin.from('my_theme_settings').upsert({ user_id: user, home_color: color, mode });
    await signIn(page, baseURL!);
    await page.goto('/');
    await expect(page.locator('[data-stack]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
    const down = page.locator('[data-stack-card][data-stair="down"]');
    await expect(down).toHaveCount(3);
    for (let step = 1; step <= 3; step += 1) {
      const card = page.locator(`[data-stack-card][data-stair="down"][data-step="${step}"]`);
      const [title, fill] = await card.evaluate((el) => [
        getComputedStyle(el.querySelector('[data-card-edge] [data-card-title]')!).color,
        getComputedStyle(el.firstElementChild!).backgroundColor,
      ]);
      expect(contrast(title, fill), `step ${step}: ${title} on ${fill}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
}

/** Each `rgba(…)` layer of a computed background, top first, composited over `under`. */
function composite(layers: string[], under: string): string {
  const base = under
    .match(/\d+(\.\d+)?/g)!
    .slice(0, 3)
    .map(Number);
  const out = layers.reverse().reduce((at, layer) => {
    const [r, g, b, a = 1] = layer.match(/\d+(\.\d+)?/g)!.map(Number);
    return at.map((c, k) => c + ([r, g, b][k] - c) * a);
  }, base);
  return `rgb(${out.map(Math.round).join(', ')})`;
}

for (const [color, mode] of [
  ['yellow', 'dark'],
  ['red', 'dark'],
  ['purple', 'dark'],
  ['blue', 'dark'],
  ['yellow', 'light'],
  ['pink', 'pastel'],
] as const) {
  test(`the read card’s label reads at 4.5:1 on its glass: ${color} ${mode}`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await admin.from('my_theme_settings').upsert({ user_id: user, home_color: color, mode });
    await signIn(page, baseURL!);
    await page.goto('/');
    await expect(page.locator('[data-stack]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
    // One flip forward: the first post is read, above the top card.
    await page.locator('[data-step-card]').first().click();
    const read = page.locator('[data-stack-card][data-stair="up"]');
    await expect(read).toHaveCount(1);
    await expect(page.locator('[data-moving]')).toHaveCount(0);
    await page.waitForTimeout(400);
    const got = await read.evaluate((el) => {
      const face = getComputedStyle(el.firstElementChild!);
      return {
        title: getComputedStyle(el.querySelector('[data-card-edge] [data-card-title]')!).color,
        opacity: getComputedStyle(el.querySelector('[data-card-edge] [data-card-title]')!).opacity,
        layers: [
          ...(face.backgroundImage.match(/rgba?\([^)]*\)/g)?.slice(0, 1) ?? []),
          face.backgroundColor,
        ],
        ground: getComputedStyle(document.querySelector('.water-ground')!).backgroundColor,
      };
    });
    const fill = composite(got.layers, got.ground);
    // The words as seen: their colour at their own opacity over the fill.
    const [r, g, b] = got.title.match(/\d+(\.\d+)?/g)!.map(Number);
    const seen = composite([`rgba(${r}, ${g}, ${b}, ${got.opacity})`], fill);
    expect(contrast(seen, fill), `${seen} on ${fill}`).toBeGreaterThanOrEqual(4.5);
  });
}
