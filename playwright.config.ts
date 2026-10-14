import { defineConfig, devices } from '@playwright/test'

/**
 * Port and web command are env-driven so the same config serves three callers:
 *  - a developer running against an already-open `pnpm dev` (default 3000),
 *  - a parallel worktree that must not fight for port 3000 (set E2E_PORT),
 *  - CI, which runs the production build (`E2E_WEB_COMMAND=pnpm start`) because
 *    dev and prod differ on RTL, caching and server actions.
 */
const PORT = process.env.E2E_PORT ?? '3000'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const WEB_COMMAND = process.env.E2E_WEB_COMMAND ?? 'pnpm dev'

/** e2e/visual.spec.ts: Percy snapshots, run only by the `visual` project. */
const VISUAL_SPEC = /visual\.spec\.ts$/

/** The x-forwarded-for header, if any: one fixed address, or one per worker. */
function forwardedForHeader(): Record<string, string> {
  const fixed = process.env.E2E_FORWARDED_FOR?.trim()
  if (fixed) return { 'x-forwarded-for': fixed }
  const prefix = process.env.E2E_FORWARDED_FOR_PREFIX?.trim()
  if (!prefix) return {}
  const worker = Number(process.env.TEST_PARALLEL_INDEX ?? 0)
  return { 'x-forwarded-for': `${prefix}.${(Number.isFinite(worker) ? worker : 0) + 1}` }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * Capped, not unbounded.
   *
   * `undefined` lets Playwright use about half the local cores, and every one
   * of those workers drives guest-cart writes against the SAME Supabase
   * project. That is a shared, finite backend, not a per-worker fixture: at
   * full parallelism the cart specs fail with an empty cart, and the pass count
   * varies run to run (53, then 50, then 44) — the signature of contention
   * rather than a regression.
   *
   * TWO IS NO LONGER ENOUGH, MEASURED 2026-09-06. This comment used to end
   * "the same suite passes 53/53 at two workers", and that is now false: the
   * suite has grown to 530 cases and two consecutive full runs at two workers
   * failed 10 and then 20 of them. NINETEEN of the 21 errors in the second run
   * were the identical sentence —
   *
   *   add-to-cart did not stick: the header badge went 0 -> 0
   *
   * — which is the contention signature and not a product defect. The same
   * specs pass serially: `E2E_WORKERS=1` gave cart.spec 21/21, a11y 80/80,
   * rtl-mobile 162/162, and production-smoke plus purchase-flow 6/6 on both
   * projects.
   *
   * The default is LEFT AT TWO deliberately. Serial is ~45 minutes against 8,
   * which is a cost paid on every run to fix a failure mode that announces
   * itself in one recognisable sentence. Drop to `E2E_WORKERS=1` when a cart or
   * checkout spec fails, and believe the serial answer over the parallel one.
   *
   * E2E_WORKERS overrides it for a machine with a local database, where the
   * contention does not apply.
   */
  workers: process.env.CI ? 1 : Number(process.env.E2E_WORKERS ?? 2),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    /**
     * Only ever non-empty in CI, and only when pointed at a Vercel preview.
     *
     * A preview with Deployment Protection on answers EVERY request with the
     * SSO wall rather than the app, so a suite aimed at one fails on missing
     * headings and 404-shaped pages - symptoms that read like an app
     * regression and are nothing of the sort. These two headers are the
     * machine's way past it: the first authenticates the request, the second
     * asks for a cookie so the redirects and subresources that follow are let
     * through too.
     *
     * With the variable unset the object is empty and nothing about a local or
     * localhost run changes.
     */
    extraHTTPHeaders: {
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? {
            'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            'x-vercel-set-bypass-cookie': 'true',
          }
        : {}),
      // The staging gate (src/lib/staging/gate.ts): with STAGING_PASSWORD set
      // the suite can be aimed at staging.kenyonexpress.co.il. Unset, nothing
      // is sent.
      ...(process.env.STAGING_PASSWORD?.trim()
        ? { 'x-staging-password': process.env.STAGING_PASSWORD.trim() }
        : {}),
      // The cart's write limiter is 120 an hour per client IP
      // (`cart_write:ip:<ip>` in server/actions/cart.ts), and `getClientIp`
      // reads x-forwarded-for first. A laptop that has run the probes, this
      // suite and the neighbour specs against one local server in an
      // afternoon uses that up, after which every add reports "add-to-cart
      // did not stick: 0 -> 0" (measured 14.10.2026, UX16: the toast said
      // "יותר מדי פעולות"). Set E2E_FORWARDED_FOR to a fresh address to run
      // under a fresh key. Unset, nothing is sent.
      //
      // E2E_FORWARDED_FOR_PREFIX=10.44.1 hands every worker its own address
      // instead (10.44.1.1, 10.44.1.2, ...), so a full run's cart writes are
      // spread over as many buckets as there are workers. Playwright sets
      // TEST_PARALLEL_INDEX before it re-evaluates this file inside each
      // worker process (lib/worker/workerProcessEntry.js, then
      // configLoader.deserializeConfig), which is what makes a per-worker
      // value possible from a static config. Measured 15.10.2026 (XF04): the
      // full suite is 1,122 cases on two workers, and its adds alone cross the
      // 120-an-hour ceiling of one address before the second back-to-back run
      // begins. The explicit single address wins when both are set.
      ...forwardedForHeader(),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [VISUAL_SPEC],
    },
    {
      // Phone viewport for RTL + layout regressions. Paid money flow stays on
      // desktop chromium only (tagged via grep invert) so CI time stays bounded.
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testIgnore: [/full-purchase-redeem\.spec\.ts/, VISUAL_SPEC],
    },
    {
      // Percy visual regression. Its own project so the functional runs above
      // never pay for it and so CI can run exactly this and nothing else under
      // `percy exec`. One browser is enough: Percy re-renders the captured DOM
      // at the widths in .percy.yml, so the local viewport only has to be wide
      // enough for the page to settle.
      name: 'visual',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [VISUAL_SPEC],
    },
  ],
  // An externally supplied base URL means the app is already running somewhere
  // we do not manage (a preview deploy), so Playwright must not start one.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: WEB_COMMAND,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          // Explicit env replaces the default inherit; keep process.env so
          // Supabase keys from .env.local / CI still reach Next.
          ...process.env,
          PORT,
          // Production builds need an explicit mock flag (see loadCardcomEnv).
          CARDCOM_USE_MOCK: process.env.CARDCOM_USE_MOCK ?? 'true',
          CARDCOM_WEBHOOK_SECRET: process.env.CARDCOM_WEBHOOK_SECRET ?? 'mock-webhook-secret',
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? BASE_URL,
          CHECKOUT_ENABLED: process.env.CHECKOUT_ENABLED ?? 'true',
          // `next start` is NODE_ENV=production and the provider gate closes
          // on a mock provider there; this opens it for the mock only, and
          // never where VERCEL is set (src/lib/payments/provider-gate.ts).
          E2E_MOCK_CHECKOUT: process.env.E2E_MOCK_CHECKOUT ?? 'local-build',
        },
      },
})
