import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every route handler that accepts a mutation must hold a gate.
 *
 * Two gate families are recognised, because the API has exactly two kinds of
 * mutating caller: humans (rate-limited -- `rateLimit` or the legacy
 * `checkRateLimit`; BOTH names are listed, because a route that migrates to
 * the newer one must not read as ungated for a commit), and machines
 * (cryptographically verified -- a constant-time secret compare, a QStash
 * signature, or a Bearer secret). A handler with NEITHER is an open write
 * endpoint, which is how the two ungated-search-webhook incidents happened.
 *
 * Complements, does not repeat: auth-coverage.test.ts owns server actions,
 * cron-auth.test.ts owns the cron routes' Bearer discipline, and
 * rate-limit/policies.test.ts owns the limiter table. This file owns the
 * yes/no question for API routes.
 */

const API_DIR = resolve(process.cwd(), 'src/app/api')
const MUTATING = /export\s+(?:const|async\s+function)\s+(POST|PUT|PATCH|DELETE)\b/
const GATES = [
  /rateLimit\(|checkRateLimit|enforceRateLimit/, // human callers
  // Machine callers. Every name here is a constant-time compare or a wrapper
  // around one; the wrappers are listed because this test reads the ROUTE
  // file, and a route that delegates its verification to a helper still holds
  // the gate. twilioSignatureValid is Twilio's HMAC-SHA1 over the public URL
  // plus the sorted form params, compared with timingSafeEqual in
  // server/whatsapp/twilio.ts -- the WhatsApp webhook was reported naked here
  // purely because that call sits one module away. verifySvixSignature is the
  // same shape for Resend: HMAC-SHA256 over `id.timestamp.rawBody` with a
  // timestamp tolerance, compared with timingSafeEqual in server/email/svix.ts.
  /timingSafeEqual|bearerMatches|verifyQstashSignature|twilioSignatureValid|verifySvixSignature/,
]

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

describe('mutating API routes', () => {
  const files = routeFiles(API_DIR)

  it('finds routes at all, so a rename cannot empty this test', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('every POST/PUT/PATCH/DELETE handler holds a rate limit or a cryptographic gate', () => {
    const naked = files
      .filter((file) => MUTATING.test(readFileSync(file, 'utf8')))
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return !GATES.some((gate) => gate.test(source))
      })
      .map((file) => relative(process.cwd(), file))
    expect(naked, 'mutating routes with no gate -- add rateLimit() or a signature check').toEqual(
      [],
    )
  })
})

/**
 * SECOND QUESTION, ADDED 2026-09-10: does a cookie-authenticated mutation refuse
 * another origin?
 *
 * `src/lib/supabase/bearer.ts` prefers the COOKIE over the bearer header, by
 * design and with the reasoning written out there, so every route that calls
 * `authenticateRequest` or `identityScopedClient` is cookie-authenticated the
 * moment a browser is the caller. Route handlers get none of the origin
 * validation Next applies to server actions.
 *
 * `SameSite=Lax` on the session cookies (measured on the live site 2026-09-10)
 * already defeats the textbook cross-SITE form post. What it does not defeat is
 * a sibling subdomain, which is same-site by definition. The argument in full is
 * in `src/lib/security/same-origin.ts`; this is the part that stays true.
 */
const COOKIE_AUTH = /authenticateRequest|identityScopedClient/
const ORIGIN_GATE = /isSameOriginRequest/

/**
 * Mutating routes that authenticate some other way, with the reason. A route
 * added to this list is a decision; a route missing from both this list and the
 * origin gate is the defect.
 */
const NO_COOKIE_TO_STEAL: Record<string, string> = {
  'src/app/api/payments/cardcom/webhook/route.ts':
    'Cardcom server-to-server callback, verified by the unguessable ?s= string and a GetLpResult round trip.',
  'src/app/api/search/index-dlq/route.ts': 'QStash signature.',
  'src/app/api/search/index-job/route.ts': 'QStash signature.',
  'src/app/api/webhooks/products/route.ts': 'Bearer secret compared in constant time.',
  'src/app/api/webhooks/resend/route.ts': 'Svix HMAC-SHA256 over the raw body.',
  'src/app/api/webhooks/twilio-sms/route.ts': 'Twilio HMAC-SHA1 over the URL and sorted params.',
  'src/app/api/webhooks/whatsapp/route.ts': 'Twilio HMAC-SHA1, same as the SMS webhook.',
  'src/app/api/supplier/redeem/route.ts':
    'Alias that re-exports the guarded handler from /api/supplier/vouchers/redeem.',
}

describe('cookie-authenticated mutations', () => {
  const files = routeFiles(API_DIR)

  it('every one of them refuses a cross-origin browser POST', () => {
    const unguarded = files
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return MUTATING.test(source) && !ORIGIN_GATE.test(source)
      })
      .map((file) => relative(process.cwd(), file))
      .filter((file) => !(file in NO_COOKIE_TO_STEAL))
      .filter((file) => COOKIE_AUTH.test(readFileSync(resolve(process.cwd(), file), 'utf8')))

    expect(
      unguarded,
      'cookie-authenticated mutating routes with no origin check -- call isSameOriginRequest() or record why the cookie cannot be used against it',
    ).toEqual([])
  })

  it('lists no exemption for a file that is gone', () => {
    const present = files.map((file) => relative(process.cwd(), file))
    for (const exempt of Object.keys(NO_COOKIE_TO_STEAL)) expect(present).toContain(exempt)
  })
})
