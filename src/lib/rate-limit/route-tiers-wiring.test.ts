import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The route tiers are one call site, in the proxy, and the proxy is not
 * unit-testable in isolation (it builds a Supabase client from the
 * environment at module load). So this pins its source the way
 * ip-allowlist-wiring.test.ts does: the import, the key, the order, and what
 * a refused request is told. route-tiers.test.ts covers the decision itself.
 */

const proxy = readFileSync(resolve(process.cwd(), 'src/proxy.ts'), 'utf8')

describe('src/proxy.ts wires the per-route token bucket', () => {
  it('imports the table, the identity and the decision from the one module', () => {
    expect(proxy).toMatch(
      /import \{ routeTierFor, routeTierIdentity, routeTierRateLimit \} from '@\/lib\/rate-limit\/route-tiers'/,
    )
  })

  it('keys on the edge address and the refreshed user together', () => {
    expect(proxy).toContain('const routeTierName = routeTierFor(request.method, pathname)')
    expect(proxy).toContain(
      'routeTierIdentity(edgeClientAddress(request.headers), user?.id ?? null)',
    )
  })

  it('runs after the session refresh and before route protection', () => {
    const refresh = proxy.indexOf('await supabase.auth.getUser()')
    const tier = proxy.indexOf('const routeTierName = routeTierFor(')
    const protection = proxy.indexOf('const needsAuth =')
    expect(refresh).toBeGreaterThan(-1)
    expect(tier).toBeGreaterThan(refresh)
    expect(protection).toBeGreaterThan(tier)
  })

  it('answers through the shared 429 builder, names the tier, and keeps the rotated cookies', () => {
    const start = proxy.indexOf('const routeTierName = routeTierFor(')
    const end = proxy.indexOf('const needsAuth =')
    const block = proxy.slice(start, end)
    expect(block).toContain('tooManyRequests(verdict.decision, {')
    expect(block).toContain('tier: verdict.tier')
    expect(block).toContain('retry_after_seconds: verdict.retryAfterSeconds')
    // A header copy, so cookie-attributes.test.ts (which scans every
    // `cookies.set(`) has nothing to inspect: the attributes are Supabase's.
    expect(block).toContain('for (const value of supabaseResponse.headers.getSetCookie())')
    expect(block).toContain("refused.headers.append('set-cookie', value)")
    expect(block).not.toContain('cookies.set(')
    expect(block).toContain('withRequestId(refused, requestId)')
    expect(block).not.toContain('status: 429')
  })
})
