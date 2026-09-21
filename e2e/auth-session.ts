import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { type BrowserContext, type Page, expect } from '@playwright/test'

/**
 * Auth helpers for paid E2E flows.
 *
 * Real Google OAuth cannot run unattended in CI. The production path still
 * presents "כניסה עם Google" at the checkout gate (asserted separately); the
 * paid legs authenticate with a seeded email/password user instead. That is
 * the same mergeGuestCart path Google's callback uses after the OAuth hop.
 */

export const E2E_CUSTOMER_EMAIL =
  process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
export const E2E_CUSTOMER_PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'
export const E2E_SUPPLIER_EMAIL =
  process.env.E2E_SUPPLIER_EMAIL ?? 'e2e-supplier@test.kenyonexpress.local'
export const E2E_SUPPLIER_PASSWORD = process.env.E2E_SUPPLIER_PASSWORD ?? 'E2eSupplier!pass1'
export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@test.kenyonexpress.local'
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2eAdmin!pass1'

/** Fixture products from scripts/seed-test-data.mjs */
export const E2E_COUPON_SLUG = 'e2e-test-coupon'
export const E2E_PHYSICAL_SLUG = 'e2e-test-physical'

/**
 * True when the paid-flow suite should run. Locally and in CI the defaults
 * above match the seed script; set E2E_PAID_FLOW=0 to force a skip.
 */
export function paidFlowEnabled(): boolean {
  if (process.env.E2E_PAID_FLOW === '0') return false
  return Boolean(E2E_CUSTOMER_EMAIL && E2E_CUSTOMER_PASSWORD)
}

/**
 * One real sign-in per role per run, then cookies.
 *
 * Measured on the 2026-09-21 go-live dry run: a full suite run performs 19
 * password sign-ins from one address, and the `login` policy allows 10 an hour
 * per IP (src/lib/rate-limit/policies.ts). Every paid-flow spec after the tenth
 * sign-in then fails on the login page with a 429 nobody asserts on, and a
 * re-run inside the same hour fails from the first spec. The limiter is right;
 * the suite was the abuser. Signing in once per role and replaying the cookies
 * keeps a run at three sign-ins.
 *
 * The cache lives under Playwright's output directory, which it empties at the
 * start of every run, so a session never outlives the run that made it. A
 * cached session that has expired lands on /login again and falls through to a
 * real sign-in, so a stale file costs one login, not a failure.
 */
const AUTH_CACHE_DIR = 'test-results/.auth'

function cachePath(email: string): string {
  return `${AUTH_CACHE_DIR}/${email.replace(/[^a-z0-9]/gi, '_')}.json`
}

type Cookie = Awaited<ReturnType<BrowserContext['cookies']>>[number]

function readCachedCookies(email: string): Cookie[] | null {
  try {
    const raw = readFileSync(cachePath(email), 'utf8')
    const parsed = JSON.parse(raw) as { cookies?: Cookie[] }
    return Array.isArray(parsed.cookies) && parsed.cookies.length > 0 ? parsed.cookies : null
  } catch {
    return null
  }
}

async function writeCachedCookies(page: Page, email: string): Promise<void> {
  try {
    mkdirSync(AUTH_CACHE_DIR, { recursive: true })
    const state = await page.context().storageState()
    writeFileSync(cachePath(email), JSON.stringify({ cookies: state.cookies }))
  } catch {
    // A cache that cannot be written costs the next spec a sign-in, nothing more.
  }
}

export async function signInWithEmail(
  page: Page,
  email: string,
  password: string,
  nextPath?: string,
): Promise<void> {
  const landing = nextPath ?? '/account'
  const cached = readCachedCookies(email)
  if (cached) {
    await page.context().addCookies(cached)
    await page.goto(landing)
    if (!new URL(page.url()).pathname.startsWith('/login')) return
    await page.context().clearCookies()
  }

  const loginUrl = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'
  await page.goto(loginUrl)
  await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
  await page.getByLabel('אימייל').fill(email)
  await page.getByLabel('סיסמה').fill(password)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  // Either the return path or a generic signed-in page; never stay on /login.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
  await writeCachedCookies(page, email)
}

/** Clears the browser storage so the next sign-in is a fresh guest session. */
export async function clearBrowserSession(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/')
}
