import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * The WordPress cutover, crawled: no URL the old site served may 404.
 *
 * `data/legacy/redirect-map.json` is checked by a unit test that never leaves
 * the filesystem. It proves the map is internally consistent and that every
 * target is a page this repository defines. It cannot prove the one thing a
 * visitor cares about, which is that a request for the old URL gets a response
 * other than "not found". That needs a running server, so it lives here.
 *
 * TWO GROUPS, AND ONLY ONE OF THEM RUNS TODAY
 *
 * 51 legacy URLs did not move: same path, same page, no redirect involved.
 * Those are asserted unconditionally and they pass now. Eight of the 51 are
 * there because the builder REFUSED a row the inventory asked for -- `/blog`,
 * the two `₪` duplicate products, and the five legal and contact pages -- so
 * they are the ones most worth crawling. Excluding them from this group would
 * have left the correction proved only against a JSON file.
 *
 * The other 33 need rows in `public.seo_redirects`, and that table holds ZERO
 * rows in production (measured 2026-09-09). The seed is written as
 * `migrations/pending/192_seed_seo_redirects.sql` and stays unapplied under the
 * standing rule that no migration runs against production without an explicit
 * go-ahead. So the second group asks the database whether the rows exist and
 * skips itself with that as the reason if they do not.
 *
 * Asking the DATABASE rather than reading an env flag is deliberate. A flag is
 * something a person sets, which means it can be set wrong in both directions:
 * left off after the migration lands, and these assertions never run again; set
 * on before it lands, and the suite goes red for a reason that is not a defect.
 * The table is the fact itself, so the day 192 is applied these tests start
 * gating with nothing to remember.
 */

type RedirectMap = {
  redirects: { source: string; target: string; status: 301 | 410 }[]
  excluded: { source: string; reason: string }[]
}

const map: RedirectMap = JSON.parse(
  readFileSync(join(__dirname, '../data/legacy/redirect-map.json'), 'utf8'),
)

const UNCHANGED_REASONS = ['same_path_live', 'source_is_live']
const unchanged = map.excluded
  .filter((e) => UNCHANGED_REASONS.includes(e.reason))
  .map((e) => e.source)

/** Is the seed applied? Answered once, from the anon-readable table itself. */
async function redirectsSeeded(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  const res = await fetch(
    `${url}/rest/v1/seo_redirects?select=source_path&is_active=is.true&limit=1`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  )
  if (!res.ok) return false
  return ((await res.json()) as unknown[]).length > 0
}

test.describe('legacy URLs that did not move still serve', () => {
  for (const path of unchanged) {
    test(`200 for ${path}`, async ({ request }) => {
      // `maxRedirects: 0` on purpose. Following a redirect would turn a wrong
      // 301 into a passing test as long as it happened to land somewhere real,
      // and "lands somewhere real" is not the contract -- these URLs are not
      // supposed to redirect at all.
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), `${path} should still be served in place`).toBe(200)
    })
  }
})

test.describe('legacy URLs that moved', () => {
  test.beforeAll(async () => {
    test.skip(
      !(await redirectsSeeded()),
      'public.seo_redirects is empty: migrations/pending/192_seed_seo_redirects.sql is written and not applied.',
    )
  })

  for (const row of map.redirects) {
    test(`${row.status} for ${row.source}`, async ({ request }) => {
      const res = await request.get(row.source, { maxRedirects: 0 })
      expect(res.status()).toBe(row.status)
      if (row.status === 301) {
        // The path only. The proxy drops the query string on purpose, and an
        // absolute-URL comparison would fail on the host under every base URL
        // this config can be pointed at.
        expect(new URL(res.headers().location ?? '', 'http://x').pathname).toBe(row.target)
      }
    })
  }
})

// The arithmetic that makes these two groups a complete answer rather than a
// sample -- every legacy URL is in exactly one bucket -- is asserted in
// src/lib/seo/legacy-redirects.test.ts, where it needs no server and runs on
// every `pnpm test`.
