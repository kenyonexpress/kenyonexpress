import type { GraduatedPolicyName } from './graduated'

/**
 * Which graduated policy a request path falls under at the edge, and what
 * identifies the caller there.
 *
 * Pure functions, separated from `proxy.ts` so the routing table has a test
 * that does not need to build a NextRequest.
 */

/**
 * Paths the shield does not meter. Every one of these proves its caller with
 * a secret or a signature (cron-auth.test.ts, route-coverage.test.ts) and is
 * reached by one machine, not by many browsers: a per-address ceiling there
 * would rate limit Vercel's scheduler and QStash, both of which arrive from
 * a small set of addresses shared with nobody.
 */
const MACHINE_PREFIXES = [
  '/api/cron/',
  '/api/jobs/',
  '/api/webhooks/',
  '/api/payments/cardcom/webhook',
  '/api/search/index-job',
  '/api/search/index-dlq',
  '/api/alerts/',
  '/api/health',
]

/** Surfaces the till app and the mobile app hit from a shared shop-floor address. */
const DEVICE_PREFIXES = ['/api/app/', '/api/supplier/app/', '/api/push/']

export function edgeShieldPolicyFor(pathname: string): GraduatedPolicyName | null {
  if (!pathname.startsWith('/api/')) return null
  if (MACHINE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null
  if (DEVICE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return 'api-device'
  return 'api-anon'
}

/**
 * The address the shield keys on, or null when there is none to key on.
 *
 * Same read, and the same caveat, as `getClientIp` in utils/rate-limit.ts:
 * `x-forwarded-for` is trustworthy only because Vercel overwrites it. With no
 * address at all (a direct local request) the shield stands aside rather than
 * putting every such caller in one `unknown` bucket, where the first test run
 * would lock out the second.
 */
export function edgeClientAddress(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwarded || headers.get('x-real-ip')?.trim() || null
  if (!address) return null
  // Bounded: this becomes part of a Redis key.
  return address.length > 64 ? address.slice(0, 64) : address
}
