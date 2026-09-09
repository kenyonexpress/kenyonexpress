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
