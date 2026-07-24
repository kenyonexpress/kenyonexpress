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
  workers: process.env.CI ? 1 : undefined,
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
        env: { PORT },
      },
})
