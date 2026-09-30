import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type Page, expect } from '@playwright/test'
import { msUntilNextStep, totpCode } from '../scripts/seed/totp.mjs'

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

/**
 * The admin fixture's TOTP secret (STEP 19: every admin-tier session must
 * pass /admin-mfa). `pnpm seed:test` enrols the factor and writes the secret
 * to .e2e/admin-totp.secret; the environment overrides the file so CI can
 * carry it as a secret instead. Null when neither exists, in which case the
 * admin login fails loudly at the challenge rather than guessing.
 */
export function adminTotpSecret(): string | null {
  const fromEnv = process.env.E2E_ADMIN_TOTP_SECRET?.trim()
  if (fromEnv) return fromEnv
  const file = resolve(process.cwd(), '.e2e/admin-totp.secret')
  if (!existsSync(file)) return null
  const fromFile = readFileSync(file, 'utf8').trim()
  return fromFile || null
}

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

/**
 * Answers the /admin-mfa challenge when the login landed there. A code with
 * under three seconds to live is minted after the step boundary instead, so
 * the submit never races the clock. No-op when the page is anywhere else.
 */
export async function completeAdminMfaIfAsked(page: Page): Promise<void> {
  if (!new URL(page.url()).pathname.startsWith('/admin-mfa')) return
  const secret = adminTotpSecret()
  expect(
    secret,
    'admin login reached /admin-mfa but no TOTP secret is available: run `pnpm seed:test` (writes .e2e/admin-totp.secret) or set E2E_ADMIN_TOTP_SECRET',
  ).toBeTruthy()
  if (msUntilNextStep() < 3_000) await page.waitForTimeout(msUntilNextStep() + 100)
  await page.locator('#mfa-code').fill(totpCode(secret as string))
  await page.getByRole('button', { name: 'אימות וכניסה' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/admin-mfa'), { timeout: 20_000 })
}

/** Password login for the admin fixture, then the MFA challenge it always meets. */
export async function signInAsAdmin(page: Page, nextPath?: string): Promise<void> {
  await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, nextPath)
  await completeAdminMfaIfAsked(page)
}

/** Clears the browser storage so the next sign-in is a fresh guest session. */
export async function clearBrowserSession(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/')
}
