import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every route handler that writes is rate limited, or is authenticated by a
 * secret that a browser never holds and says so here.
 *
 * The limiter chain (limiter.ts: Upstash, then Postgres, then open-and-loud)
 * only protects the routes that call it, and a route handler is one file
 * that nobody has to register anywhere. This walks `src/app/api`, finds the
 * files that export a mutating method, and requires each to either name a
 * limiter or appear below with the guard that replaces one. A guard entry is
 * checked against the source too: the exemption is for a route that verifies
 * a secret, not for a route that once did.
 */

const API_ROOT = 'src/app/api'
const ROOT = process.cwd()

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...routeFiles(path))
    else if (entry.name === 'route.ts') out.push(path)
  }
  return out.sort()
}

const MUTATING_EXPORT = /export (?:const|async function|function) (POST|PUT|PATCH|DELETE)\b/
const RE_EXPORT = /export \{[^}]*\b(POST|PUT|PATCH|DELETE)\b[^}]*\} from '([^']+)'/

const LIMITER_CALL =
  /\b(?:rateLimit|rateLimitByKey|checkRateLimit|checkUserRateLimit|checkoutVelocity)\(/

/**
 * Routes with no session and no cookie: the caller proves itself with a
 * shared secret or a signature, so there is no per-visitor budget to spend
 * and nothing a cross-site page can drive. Each guard regex must still match.
 */
const SECRET_AUTHENTICATED: { path: string; guard: RegExp; reason: string }[] = [
  {
    path: 'src/app/api/alerts/uptimerobot/route.ts',
    guard: /secretEquals\(/,
    reason: 'UptimeRobot posts with a shared secret, compared in constant time',
  },
  {
    path: 'src/app/api/payments/cardcom/webhook/route.ts',
    guard: /verifyLowProfile\(/,
    reason: 'the payload is never trusted; the outcome is re-fetched from Cardcom',
  },
  {
    path: 'src/app/api/search/index-dlq/route.ts',
    guard: /verifyQstashSignature\(/,
    reason: 'QStash delivery, signed',
  },
  {
    path: 'src/app/api/jobs/dlq/route.ts',
    guard: /verifyQstashSignature\(/,
    reason: 'QStash failure callback for the job queue, signed',
  },
  {
    path: 'src/app/api/jobs/run/route.ts',
    guard: /verifyQstashSignature\(|bearerMatches\(/,
    reason: 'QStash delivery, signed; or CRON_SECRET as bearer for a manual replay',
  },
  {
    path: 'src/app/api/search/index-job/route.ts',
    guard: /verifyQstashSignature\(|bearerMatches\(/,
    reason: 'QStash delivery, signed; or CRON_SECRET as bearer for ops',
  },
  {
    path: 'src/app/api/webhooks/products/route.ts',
    guard: /timingSafeEqual\(/,
    reason: 'shared webhook secret, compared in constant time',
  },
  {
    path: 'src/app/api/webhooks/twilio-sms/route.ts',
    guard: /TWILIO_AUTH_TOKEN/,
    reason: 'Twilio request signature, keyed with the auth token',
  },
  {
    path: 'src/app/api/webhooks/whatsapp/route.ts',
    guard: /x-twilio-signature/,
    reason: 'Twilio request signature, keyed with the auth token',
  },
]

const FILES = routeFiles(API_ROOT).map((path) => ({
  path,
  source: readFileSync(resolve(ROOT, path), 'utf8'),
}))

const MUTATING = FILES.filter(
  ({ source }) => MUTATING_EXPORT.test(source) || RE_EXPORT.test(source),
)

describe('mutating route handlers are rate limited or secret-authenticated', () => {
  it('finds the route tree at all', () => {
    expect(FILES.length).toBeGreaterThan(40)
    expect(MUTATING.length).toBeGreaterThan(10)
  })

  it('every exemption still points at a mutating route', () => {
    for (const entry of SECRET_AUTHENTICATED) {
      expect(
        MUTATING.some((f) => f.path === entry.path),
        `${entry.path} is not a mutating route any more; drop the entry.`,
      ).toBe(true)
    }
  })

  it.each(MUTATING.map((f) => [f.path, f] as const))('%s', (_path, file) => {
    // An alias that re-exports another route's handler is covered by that
    // route's own entry in this list.
    const reExport = file.source.match(RE_EXPORT)
    if (reExport) {
      const target = `src/${(reExport[2] ?? '').replace(/^@\//, '')}.ts`
      expect(
        MUTATING.some((f) => f.path === target),
        `${file.path} re-exports from ${target}, which this scan did not find.`,
      ).toBe(true)
      return
    }

    const exemption = SECRET_AUTHENTICATED.find((entry) => entry.path === file.path)
    if (exemption) {
      expect(
        exemption.guard.test(file.source),
        `${file.path} is exempt because "${exemption.reason}", but no longer matches ${exemption.guard}.`,
      ).toBe(true)
      return
    }

    expect(
      LIMITER_CALL.test(file.source),
      `${file.path} exports a mutating method and calls no limiter. Add rateLimit('<policy>', ...) from @/lib/rate-limit, or list it in SECRET_AUTHENTICATED with the guard that replaces one.`,
    ).toBe(true)
  })
})
