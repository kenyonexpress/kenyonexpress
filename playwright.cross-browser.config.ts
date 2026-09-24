import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

/**
 * Cross-browser and device matrix (architecture step 88).
 *
 * The default config runs Desktop Chrome and Pixel 5 only, which is the bounded
 * CI budget. This config layers the engines and devices the go-live audit asks
 * for on top of it, without changing what `pnpm test:e2e` does:
 *
 *   - Firefox (Gecko) and Safari (WebKit) on desktop,
 *   - iPhone 15 and iPad Pro 11 on WebKit, which is what iOS actually ships,
 *   - Galaxy S24 on Chromium.
 *
 * It is meant for the breadth specs (smoke-all-routes, rtl-three-widths,
 * touch-targets, price-bidi, a11y), not the paid money flow: the money flow is
 * a server contract, not a rendering one, and is already proven on Chromium.
 *
 *   E2E_BASE_URL=http://localhost:3388 pnpm test:e2e:cross
 *
 * WebKit and Firefox are installed with `pnpm exec playwright install webkit firefox`.
 */
export default defineConfig({
  ...base,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone-15', use: { ...devices['iPhone 15'] } },
    { name: 'galaxy-s24', use: { ...devices['Galaxy S24'] } },
    { name: 'ipad-pro-11', use: { ...devices['iPad Pro 11'] } },
  ],
})
