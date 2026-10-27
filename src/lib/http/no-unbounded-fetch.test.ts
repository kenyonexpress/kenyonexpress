import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * THE GATE. A bare `fetch` has no timeout, so a host that accepts the
 * connection and then goes quiet holds the caller open until the platform's own
 * request ceiling kills it. On a serverless platform that means a function
 * alive, billed by wall clock, and holding one slot of a bounded concurrency
 * pool -- so one unreachable third party can exhaust the pool and take down
 * routes that never touched it.
 *
 * `cardcom.ts` worked this out for the card gateway in August. The audit that
 * produced this file found the lesson had not travelled: fourteen other
 * outbound call sites across eleven modules were still bare, including the
 * invoice PDF mirror and every customer-facing notification.
 *
 * So the rule is now enforced rather than remembered. Every `fetch(` in `src`
 * must either go through `fetchWithTimeout` or appear below with a reason. A
 * new bare one fails this test, which is the only way a rule like this survives
 * the person who wrote it.
 */

const SRC = resolve(__dirname, '../..')

/**
 * Each entry is a file allowed to call `fetch` directly, and why. The reason is
 * not decoration: it is the thing a reader needs in order to decide whether an
 * entry is still earned.
 */
const ALLOWED: Record<string, string> = {
  // --- Carry their own explicit ceiling, predating the helper -------------
  'lib/payments/cardcom.ts':
    'AbortController + CARDCOM_TIMEOUT_MS, plus per-call-site retry opt-in that no shared helper can decide.',
  'lib/rate-limit/upstash.ts':
    'AbortSignal.timeout(config.timeoutMs), a per-config ceiling, and cache: no-store so the counter is never served stale.',
  'lib/observability/alert.ts':
    'AbortSignal.timeout(4000). A hung alert must not hold a Cardcom webhook open, because Cardcom retries on timeout.',
  'lib/observability/posthog.ts':
    'AbortSignal.timeout(4_000), and voided rather than awaited so analytics can never fail the request it describes.',
  'lib/health/checks.ts':
    'AbortSignal.timeout(4000). A health probe that can hang is the one thing worse than no health probe.',
  'lib/search/drift.ts':
    'AbortSignal.timeout(4000) on the Meilisearch stats read that the drift check compares against.',
  'lib/env-probe.ts':
    'AbortController driven by its own timeoutMs argument, because the caller decides how long a preflight may take.',
  'lib/cache.ts':
    'AbortController with 5000ms timeout to Vercel cache API. Purge failure is non-blocking and silent.',
  'lib/admin/legal-docs-verifier.ts':
    'AbortSignal.timeout(5000). HEAD requests to verify legal document presence for compliance audit.',
  'app/api/cron/health/route.ts':
    'AbortSignal.timeout(5000) on the ntfy push. A cron that hangs on its own notification never reports the health it measured.',

  // --- Browser calls to our own origin ------------------------------------
  'lib/search.ts':
    "Runs in the browser against /api/search and forwards the caller's AbortSignal, which is how a superseded keystroke is cancelled.",
  'lib/analytics/tracker.ts':
    'Browser, fire-and-forget beacon to our own origin. A hang costs the page nothing; it is not awaited.',
  'components/cart/CartBootstrap.tsx':
    'Browser, and carries its own AbortController so an unmount cancels the bootstrap rather than leaking it.',

  'app/error.tsx':
    'Browser error boundary: probes our own /api/health to tell the visitor whether the site is down, and a hung probe costs the page nothing.',
  'components/account/BrowserPushToggle.tsx':
    'Browser, to our own /api/push/subscribe, fired by a user click on a toggle that shows its busy state; a hang costs the page nothing.',
  'components/auth/PasskeyBanner.tsx':
    'Browser, to our own passkey routes, inside a WebAuthn ceremony the browser already bounds with its own prompt timeout.',
  'components/auth/PasskeyManager.tsx':
    'Browser, to our own passkey routes, inside a WebAuthn ceremony the browser already bounds with its own prompt timeout.',
  'components/auth/PasskeySignIn.tsx':
    'Browser, to our own passkey routes, inside a WebAuthn ceremony the browser already bounds with its own prompt timeout.',
  'components/auth/WhatsappOtpForm.tsx':
    'Browser call to our own origin from a form that shows its own pending state; the server side of the route is rate limited and bounded.',
  'components/checkout/CardVerificationStep.tsx':
    'Browser, and it opens a payment page: a client timeout cannot cancel the server-side verification row, only invite a second one.',
  'components/checkout/ShippingPhoneVerification.tsx':
    'Browser call to our own origin from a form that shows its own pending state; the server side of the route is rate limited and bounded.',
  'app/(auth)/forgot-password/ForgotPasswordForm.tsx':
    'Browser call to our own origin from a form that shows its own pending state; the server side of the route is rate limited and bounded.',
  'app/(auth)/login/LoginForm.tsx':
    'Browser call to our own origin from a form that shows its own pending state; the server side of the route is rate limited and bounded.',
  'app/(auth)/signup/SignupForm.tsx':
    'Browser call to our own origin from a form that shows its own pending state; the server side of the route is rate limited and bounded.',
  'components/storefront/ContactForm.tsx':
    'Browser call to our own origin from a form that shows its own pending state; the server side of the route is rate limited and bounded.',
  'components/storefront/SupplierLeadForm.tsx':
    'Browser call to our own origin from a form that shows its own pending state; the server side of the route is rate limited and bounded.',
  'components/push/PushPrompt.tsx':
    'Browser, fire-and-forget subscribe to our own origin after the permission prompt; a hang costs the page nothing.',
  'lib/offline/sync.ts':
    'Browser replay of the offline queue to our own origin; a stalled item stays queued and is retried with backoff, which is its own ceiling.',

  // --- Deliberately unbounded, on the voucher-burn path -------------------
  'app/(supplier)/scan/ScanClient.tsx':
    'The redeem POST burns a voucher. A timeout cannot cancel it -- the request may have arrived and only the response may be lost -- so it would only invite a retry that can burn twice, because a scan reset rotates the idempotency key. Bounding it needs a server-side idempotency window, not a client timer. The lookup call in the same file IS bounded.',
  'app/redeem/[token]/RedeemConfirm.tsx':
    'Same voucher-burn reasoning as ScanClient: a POST to /vouchers/redeem that times out has not necessarily failed.',
}

/** `fetch(` not preceded by an identifier character or a dot. */
const BARE_FETCH = /(?<![A-Za-z0-9_$.])fetch\s*\(/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      sourceFiles(full, out)
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.test\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

function filesCallingFetchDirectly(): string[] {
  return sourceFiles(SRC)
    .filter((full) => {
      // The helper itself is the one place a bare fetch is the point.
      if (full.endsWith(join('lib', 'http', 'fetch-with-timeout.ts'))) return false
      return readFileSync(full, 'utf8')
        .split('\n')
        .some((line) => BARE_FETCH.test(line))
    })
    .map((full) => relative(SRC, full).split(/[\\/]/).join('/'))
    .sort()
}

describe('no unbounded fetch', () => {
  it('every direct fetch call site is one this file names, with a reason', () => {
    expect(filesCallingFetchDirectly()).toEqual(Object.keys(ALLOWED).sort())
  })

  it('every allowance carries a reason somebody can check', () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(30)
    }
  })

  /**
   * The list is only a gate while it is accurate. An entry left behind after
   * its file is deleted or converted is a hole nobody can see.
   */
  it('names no file that has stopped calling fetch directly', () => {
    const actual = new Set(filesCallingFetchDirectly())
    const stale = Object.keys(ALLOWED).filter((f) => !actual.has(f))
    expect(stale, 'these allowances are no longer earned; delete them').toEqual([])
  })
})
