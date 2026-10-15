import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type BrowserContext, type Page, expect, test } from '@playwright/test'
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

/**
 * One password sign-in per role per run, replayed as cookies afterwards.
 *
 * The sign-in action is limited to ten an hour per client IP (`login:<ip>`,
 * the checkRateLimit default) and twenty an hour per account
 * (`login-account:<email>`), both DB-backed, so neither resets with the server.
 * Counted on 15.10.2026 (XF04): the full suite signs the customer in from
 * eight specs on two projects, sixteen times, plus the supplier and the admin,
 * and the second back-to-back run started inside the same hour. The limiter
 * is right; the suite was the abuser. Signing in once per role and replaying
 * the cookies keeps a run at about three sign-ins however many specs need a
 * session, and two runs an hour apart or not stay under both ceilings.
 *
 * The cache lives under Playwright's output directory, which it empties at the
 * start of every run, so a session never outlives the run that made it. A
 * replay that lands on /login again (expired, or revoked by a neighbouring
 * sign-in) falls through to a real sign-in, so a stale file costs one login,
 * not a failure. Specs that test the login UI itself (login-dialog) drive the
 * form directly and do not go through here.
 */
const AUTH_CACHE_DIR = 'test-results/.auth'

function cachePath(email: string): string {
  return resolve(process.cwd(), AUTH_CACHE_DIR, `${email.replace(/[^a-z0-9]/gi, '_')}.json`)
}

type Cookie = Awaited<ReturnType<BrowserContext['cookies']>>[number]

function readCachedCookies(email: string): Cookie[] | null {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(email), 'utf8')) as { cookies?: Cookie[] }
    return Array.isArray(parsed.cookies) && parsed.cookies.length > 0 ? parsed.cookies : null
  } catch {
    return null
  }
}

async function writeCachedCookies(page: Page, email: string): Promise<void> {
  try {
    mkdirSync(resolve(process.cwd(), AUTH_CACHE_DIR), { recursive: true })
    const state = await page.context().storageState()
    writeFileSync(cachePath(email), JSON.stringify({ cookies: state.cookies }))
  } catch {
    // A cache that cannot be written costs the next spec a sign-in, nothing more.
  }
}

function onLoginOrChallenge(url: URL): boolean {
  return url.pathname.startsWith('/login') || url.pathname.startsWith('/admin-mfa')
}

export async function signInWithEmail(
  page: Page,
  email: string,
  password: string,
  nextPath?: string,
  options: {
    /**
     * Drive the real form even when a session is cached. The sign-in action
     * is what merges the guest cart into the account (`mergeGuestCart` in
     * server/actions/auth.ts); replayed cookies skip it, and a spec that built
     * a guest cart first would then pay for whatever the account held.
     */
    mergeGuestCart?: boolean
  } = {},
): Promise<void> {
  const cached = options.mergeGuestCart ? null : readCachedCookies(email)
  if (cached) {
    await page.context().addCookies(cached)
    await page.goto(nextPath ?? '/account')
    if (!onLoginOrChallenge(new URL(page.url()))) return
    await page.context().clearCookies()
  }

  const loginUrl = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'
  await page.goto(loginUrl)
  await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
  await page.getByLabel('אימייל', { exact: true }).fill(email)
  await page.getByLabel('סיסמה', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  // Either the return path or a generic signed-in page; never stay on /login.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
  // An admin session is only worth replaying once the MFA challenge is behind
  // it; signInAsAdmin writes that one after completeAdminMfaIfAsked.
  if (!new URL(page.url()).pathname.startsWith('/admin-mfa')) await writeCachedCookies(page, email)
}

/**
 * Answers the /admin-mfa challenge when the login landed there. A code with
 * under three seconds to live is minted after the step boundary instead, so
 * the submit never races the clock. No-op when the page is anywhere else.
 */
export async function completeAdminMfaIfAsked(page: Page): Promise<void> {
  // The login's own wait resolves on the first non-login URL, and the MFA
  // page can be one client hop further: let the navigation settle before
  // reading where the session landed.
  await page.waitForLoadState('networkidle').catch(() => undefined)
  const landed = new URL(page.url())
  if (!landed.pathname.startsWith('/admin-mfa')) return
  if (landed.searchParams.get('mode') === 'enrol') skipAdminEnrolment()
  // ENROLMENT is not the challenge. The hosted database's admin fixture has
  // no TOTP factor (the page offers "התחלת הגדרה" and a QR, not a code field;
  // measured 15.10.2026, WRETRY-XF04), and enrolling one from a test is a
  // write to a real account's auth factors. Such a database cannot prove the
  // admin legs, so they skip with that reason instead of timing out on a
  // heading 20s later.
  if (
    await page
      .getByRole('button', { name: 'התחלת הגדרה' })
      .isVisible()
      .catch(() => false)
  ) {
    skipAdminEnrolment()
  }
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

export function skipAdminEnrolment(): never {
  test.skip(
    true,
    'admin fixture has no TOTP factor on this database (the MFA page offers enrolment, not a challenge); run pnpm seed:test against a database that may be written',
  )
  throw new Error('unreachable: test.skip ends the test')
}

/** Password login for the admin fixture, then the MFA challenge it always meets. */
export async function signInAsAdmin(page: Page, nextPath?: string): Promise<void> {
  await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, nextPath)
  const challenged = new URL(page.url()).pathname.startsWith('/admin-mfa')
  await completeAdminMfaIfAsked(page)
  if (challenged) await writeCachedCookies(page, E2E_ADMIN_EMAIL)
}

/** Clears the browser storage so the next sign-in is a fresh guest session. */
export async function clearBrowserSession(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/')
}
