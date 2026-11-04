/**
 * The E2E bypass for the two bot controls that refuse an automated browser.
 *
 * WHY IT EXISTS. The launch audit of 05.11.2026 ran the Playwright suite
 * against a plain `pnpm start` of the production build and lost 21 journeys
 * at the fixture sign-in: Turnstile refused the token the headless browser
 * produced ("אימות האבטחה נכשל") and the `login` policy of the rate limiter
 * rejected the retries. Both controls were doing their job. Neither can tell a
 * test runner from a bot, so the runner identifies itself.
 *
 * HOW IT IS GATED, and every clause matters:
 *
 *   1. `TEST_BYPASS_SECRET` must be set in the server's environment AND be at
 *      least 32 characters. Unset, empty or short means NO bypass exists, so
 *      an environment that never heard of this file behaves exactly as before.
 *      The 32-character floor stops a one-letter value from becoming a key.
 *   2. The request must carry `x-test-secret` equal to it, compared in
 *      constant time. A missing header is a normal request.
 *   3. Outside a request scope (a cron, a script, a unit test) `headers()`
 *      throws, and the answer is "no bypass".
 *
 * WHAT IT IS NOT. It is not `NODE_ENV === 'test'`: a running `next start` is
 * `production` whatever the suite thinks, and a check on that variable would
 * either never fire or turn every vitest refusal test vacuous. The secret is
 * the only switch.
 *
 * WHERE THE VALUE LIVES. `.env.local` (gitignored) for a laptop run, and the
 * Vercel preview + production env. NEVER `.env.test`: that file is tracked by
 * git in a public repository, and a committed value would hand anyone a
 * header that switches off Turnstile and every rate limit in production.
 */

export const TEST_BYPASS_HEADER = 'x-test-secret'

/** Shorter than this and the variable is treated as unset. */
export const TEST_BYPASS_MIN_LENGTH = 32

/** Constant-time string equality without `node:crypto`, so an edge import stays possible. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** The configured secret, or null when the bypass is switched off. */
export function testBypassSecret(source: NodeJS.ProcessEnv = process.env): string | null {
  const secret = source.TEST_BYPASS_SECRET?.trim()
  if (!secret || secret.length < TEST_BYPASS_MIN_LENGTH) return null
  return secret
}

/** True only when a secret is configured and `given` equals it. */
export function testBypassMatches(
  given: string | null | undefined,
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  const secret = testBypassSecret(source)
  if (!secret || !given) return false
  return constantTimeEqual(secret, given.trim())
}

/**
 * True when the current request carries the matching header. Safe to call from
 * anywhere: without a configured secret it never touches `next/headers`, and
 * outside a request scope it answers false.
 */
export async function requestHasTestBypass(
  source: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!testBypassSecret(source)) return false
  try {
    const { headers } = await import('next/headers')
    const list = await headers()
    return testBypassMatches(list.get(TEST_BYPASS_HEADER), source)
  } catch {
    return false
  }
}
