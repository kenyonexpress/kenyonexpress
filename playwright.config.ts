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
   * rather than a regression. The same suite passes 53/53 at two workers and in
   * isolation.
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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Phone viewport for RTL + layout regressions. Paid money flow stays on
      // desktop chromium only (tagged via grep invert) so CI time stays bounded.
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testIgnore: [/full-purchase-redeem\.spec\.ts/],
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
