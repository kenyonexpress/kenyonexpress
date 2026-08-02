import { type Page, expect } from '@playwright/test'

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

/** Fixture product from scripts/seed-test-data.mjs */
export const E2E_COUPON_SLUG = 'e2e-test-coupon'

/**
 * True when the paid-flow suite should run. Locally and in CI the defaults
 * above match the seed script; set E2E_PAID_FLOW=0 to force a skip.
 */
export function paidFlowEnabled(): boolean {
  if (process.env.E2E_PAID_FLOW === '0') return false
  return Boolean(E2E_CUSTOMER_EMAIL && E2E_CUSTOMER_PASSWORD)
}

export async function signInWithEmail(
  page: Page,
  email: string,
  password: string,
  nextPath?: string,
): Promise<void> {
  const loginUrl = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'
  await page.goto(loginUrl)
  await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
  await page.getByLabel('אימייל').fill(email)
  await page.getByLabel('סיסמה').fill(password)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  // Either the return path or a generic signed-in page; never stay on /login.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
}

/** Clears the browser storage so the next sign-in is a fresh guest session. */
export async function clearBrowserSession(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/')
}
