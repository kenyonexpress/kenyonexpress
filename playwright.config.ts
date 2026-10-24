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

/**
 * Every cart write is limited to 120/hour per client IP, and the counter is
 * DB-backed (`check_rate_limit`), so it survives a server restart. Two full
 * runs from one laptop inside an hour exhaust it, and from then on every add
 * fails as "the header badge went 0 -> 0" with a clean server log: measured
 * 2026-10-20, 15 mobile-chrome failures in the second run of the day, none in
 * the first. `getClientIp()` reads x-forwarded-for first, so a fresh address
 * is a fresh bucket. Set E2E_FORWARDED_FOR=10.44.0.7 for one address, or
 * E2E_FORWARDED_FOR_PREFIX=10.44.<run> to give each worker its own
 * (Playwright re-evaluates this file inside every worker with
 * TEST_PARALLEL_INDEX set). Local only: Vercel overwrites the header.
 */
const FORWARDED_FOR = process.env.E2E_FORWARDED_FOR_PREFIX
  ? `${process.env.E2E_FORWARDED_FOR_PREFIX}.${Number(process.env.TEST_PARALLEL_INDEX ?? 0) + 1}`
  : process.env.E2E_FORWARDED_FOR

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
      ...(FORWARDED_FOR ? { 'x-forwarded-for': FORWARDED_FOR } : {}),
    },
  },
  projects: [
    {
      name: 'chromium-380',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 380, height: 800 },
      },
    },
    {
      name: 'chromium-768',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'chromium-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'webkit-380',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 380, height: 800 },
      },
    },
    {
      name: 'webkit-768',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'webkit-1440',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 },
      },
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
        },
      },
})
