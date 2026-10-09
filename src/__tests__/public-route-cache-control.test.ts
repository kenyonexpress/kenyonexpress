import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { CacheControl } from '@/lib/cache/http'
import { describe, expect, it } from 'vitest'

/**
 * EVERY GET ROUTE HANDLER DECLARES ITS CACHE POLICY, AND THE DECLARATION IS
 * THE SHARED CONSTANT.
 *
 * Pages get their CDN header derived from `cacheLife`; route handlers get
 * nothing unless they set one, and Vercel's default for an unset header on a
 * route handler is "do not cache". That default is right for a cart and wrong
 * for a search result, and the difference between the two is a string
 * literal in a file nobody reads twice. Three routes carried the search
 * policy as three separate literals before `lib/cache/http.ts`.
 *
 * The ledger below names every public-facing GET handler and whether it must
 * be shared-cacheable (`public`) or per-caller (`private`). A new route must
 * be added here with a decision; the test fails on an unlisted one rather
 * than guessing. Private route groups (admin, cron, supplier, account, the
 * till app, auth, webhooks, payments) are excluded wholesale: they are behind
 * a session or a secret and are never CDN candidates.
 */

const root = resolve(__dirname, '../..')
const APP = resolve(root, 'src/app')

const EXCLUDED_SEGMENTS =
  /\/(admin|cron|supplier|account|auth|webhooks|payments|checkout|monitoring|debug)\//

/** `src/app/api/app/` is the till app's API, bearer-authenticated. */
const EXCLUDED_PREFIXES = ['src/app/api/app/']

type Policy = 'public' | 'private' | 'redirect'

const LEDGER: Record<string, Policy> = {
  'src/app/api/alerts/uptimerobot/route.ts': 'private',
  'src/app/api/cart/route.ts': 'private',
  'src/app/api/health/route.ts': 'private',
  'src/app/api/ready/route.ts': 'private',
  'src/app/api/search/facets/route.ts': 'public',
  'src/app/api/search/quick-links/route.ts': 'private',
  'src/app/api/search/route.ts': 'public',
  'src/app/api/search/suggest/route.ts': 'private',
  'src/app/api/wallet/apple/[id]/route.ts': 'private',
  // Sets the coupon cookie and 307s home. A redirect that sets a cookie is
  // per-caller by construction; NextResponse.redirect carries no
  // Cache-Control and Vercel does not cache a header-less 3xx.
  'src/app/c/[code]/route.ts': 'redirect',
  'src/app/feed.xml/route.ts': 'public',
  'src/app/merchant.xml/route.ts': 'public',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name === 'route.ts') out.push(p)
  }
  return out
}

const handlers = walk(APP)
  .map((p) => relative(root, p))
  .filter((p) => !EXCLUDED_SEGMENTS.test(`/${p}`))
  .filter((p) => !EXCLUDED_PREFIXES.some((prefix) => p.startsWith(prefix)))
  .filter((p) =>
    /export (const|async function|function) GET\b/.test(readFileSync(resolve(root, p), 'utf8')),
  )
  .sort()

describe('public GET route handlers', () => {
  it('are all in the ledger, and the ledger names nothing that is gone', () => {
    expect(handlers).toEqual(Object.keys(LEDGER).sort())
  })

  for (const [file, policy] of Object.entries(LEDGER)) {
    it(`${file} is ${policy}`, () => {
      const source = readFileSync(resolve(root, file), 'utf8')
      if (policy === 'redirect') {
        expect(source).toContain('NextResponse.redirect(')
        expect(source).not.toMatch(/public,\s*(max-age|s-maxage)/)
        return
      }
      if (policy === 'public') {
        // The constant, not a literal: a literal is how three copies drift.
        expect(source).toMatch(/CacheControl\.(search|feed|postalCode)/)
        expect(source).not.toMatch(/['"]public,\s*(max-age|s-maxage)/)
        return
      }
      // private: an explicit non-shared policy on every response. The
      // literal forms are tolerated where the route explains a browser TTL
      // (suggest) or predates the constant; a `public` anywhere is the bug.
      expect(source).toMatch(/CacheControl\.private|['"]private,|['"]no-store['"]/)
      expect(source).not.toMatch(/['"]public,/)
    })
  }

  it('the shared constants say what the ledger assumes', () => {
    expect(CacheControl.search.startsWith('public,')).toBe(true)
    expect(CacheControl.feed.startsWith('public,')).toBe(true)
    expect(CacheControl.private).toBe('private, no-store')
  })
})
