import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every scheduled and queue-driven route proves the caller before it does
 * anything, and proves it in constant time.
 *
 * WHY THIS EXISTS SEPARATELY FROM route-guards.test.ts. That gate covers the
 * routes a PERSON reaches, and its guards are session based: `requireSection`,
 * `requireSupplierRole`. Nothing under `src/app/api/cron` has a session at all.
 * A cron route is reached by Vercel with a bearer secret, which means the whole
 * of its authorization is one line near the top of the handler, and that line
 * is exactly the kind of thing a new route forgets. There was no test that
 * would notice.
 *
 * WHAT IT WOULD COST TO FORGET. These handlers are not read-only. They generate
 * invoices, expire vouchers, mail abandoned carts, and — the reason this gate
 * was written during the payments verification — `/api/cron/reconcile` pulls
 * every terminal's transaction list from Cardcom and mails an admin alert. An
 * unauthenticated caller could run all of that on demand.
 *
 * WHY IT INSISTS ON `bearerMatches` AND NOT JUST "some check". Before
 * `src/lib/security/constant-time.ts` existed, the cron routes compared the
 * secret with `!==` on a template string, which stops at the first differing
 * byte and is therefore guessable a byte at a time by a caller who can time the
 * response. Every route was converted. Nothing stopped route eleven from being
 * written in the old style, because both spellings answer 401 to a wrong secret
 * and 200 to the right one: the difference is invisible to every behavioural
 * test. Only a source scan sees it.
 */

const CRON_ROOT = 'src/app/api/cron'

/**
 * Not under `api/cron`, but machine-driven in exactly the same way: nobody is
 * logged in, the URL is the whole of the attack surface, and the handlers write
 * with admin credentials. The QStash search worker and its dead-letter callback
 * belong to this gate for the same reason the cron routes do.
 */
const ALSO_MACHINE_DRIVEN = [
  'src/app/api/search/index-job/route.ts',
  'src/app/api/search/index-dlq/route.ts',
]

/**
 * The two ways a caller with no session is allowed to prove itself here, and
 * both are constant time.
 *
 * `verifyQstashSignature` rather than `bearerMatches` is not a weaker check and
 * the gate must not push it towards one: the DLQ callback is fired by Upstash
 * and by nothing else, so a JWS over the body is a STRONGER statement than a
 * shared secret in a header. The worker accepts either, because a human
 * replaying a dead job by hand cannot produce Upstash's signature.
 */
const ACCEPTED_CHECKS = ['bearerMatches', 'verifyQstashSignature']

/**
 * The comparison this codebase removed. Written as a pattern rather than a
 * string so it catches the shape, not one spelling of it: any `!==` or `===`
 * whose other side mentions the cron secret.
 */
const TIMING_UNSAFE = /(!==|===)\s*[^\n]*CRON_SECRET|CRON_SECRET[^\n]*(!==|===)/

function cronRouteFiles(): string[] {
  const cwd = process.cwd()
  const abs = resolve(cwd, CRON_ROOT)
  const found: string[] = []
  for (const entry of readdirSync(abs)) {
    const dir = join(abs, entry)
    if (!statSync(dir).isDirectory()) continue
    const route = join(dir, 'route.ts')
    try {
      if (statSync(route).isFile()) found.push(relative(cwd, route).split('\\').join('/'))
    } catch {
      // A cron directory with no route.ts is a layout accident, not a hole.
    }
  }
  return found.sort()
}

/** Comments quote `bearerMatches` while explaining it. Only real code counts. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

describe('scheduled routes authenticate', () => {
  const files = [...cronRouteFiles(), ...ALSO_MACHINE_DRIVEN]

  it('finds the cron tree at all', () => {
    // Without this, moving or renaming the tree would empty the scan and turn
    // every assertion below into a silent pass.
    expect(cronRouteFiles().length).toBeGreaterThanOrEqual(10)
  })

  it.each(files)('%s proves who is calling', (file) => {
    const code = codeOnly(readFileSync(resolve(process.cwd(), file), 'utf8'))
    const used = ACCEPTED_CHECKS.filter((check) => new RegExp(`\\b${check}\\s*\\(`).test(code))
    expect(
      used,
      `${file} has no caller check. It is reachable by URL alone and writes with admin credentials, so it must call one of: ${ACCEPTED_CHECKS.join(', ')}.`,
    ).not.toHaveLength(0)
  })

  it.each(files)('%s refuses an unauthenticated caller with 401', (file) => {
    const code = codeOnly(readFileSync(resolve(process.cwd(), file), 'utf8'))
    expect(
      /status:\s*401/.test(code),
      `${file} checks the caller but never answers 401. Check what it does when the check fails.`,
    ).toBe(true)
  })

  it.each(files)('%s does not compare the secret with === or !==', (file) => {
    const code = codeOnly(readFileSync(resolve(process.cwd(), file), 'utf8'))
    expect(
      TIMING_UNSAFE.test(code),
      `${file} compares CRON_SECRET directly. Use bearerMatches() from @/lib/security/constant-time: string comparison stops at the first differing byte and leaks the secret to a caller who can time the response.`,
    ).toBe(false)
  })

  it('names every route it found, so a new one is a visible diff', () => {
    // A cron route added without a secret check fails the assertions above. A
    // cron route added WITH one still shows up here, which is the point: the
    // list is the record of what runs on a schedule with admin credentials.
    expect(cronRouteFiles()).toEqual([
      'src/app/api/cron/abandoned-cart/route.ts',
      'src/app/api/cron/expire-vouchers/route.ts',
      'src/app/api/cron/health/route.ts',
      'src/app/api/cron/invoices/route.ts',
      'src/app/api/cron/notifications/route.ts',
      'src/app/api/cron/reap-carts/route.ts',
      'src/app/api/cron/reconcile/route.ts',
      'src/app/api/cron/stock/route.ts',
      'src/app/api/cron/stranded-payments/route.ts',
      'src/app/api/cron/subscriptions/route.ts',
    ])
  })
})
