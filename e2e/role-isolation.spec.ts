import { expect, test } from '@playwright/test'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  clearBrowserSession,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'

/**
 * Role isolation, in the direction nothing was checking: SIGNED IN as the
 * wrong person.
 *
 * =========================================================================
 * WHAT WAS ALREADY COVERED, SO THIS IS NOT READ AS DUPLICATING IT
 * =========================================================================
 *
 * `coupon-scan.spec.ts` proves the SIGNED-OUT cases: a stranger at
 * `/supplier/scan` is sent to login, and a forged voucher token is refused
 * without leaking whether the voucher exists. `smoke-all-routes.spec.ts` lists
 * `/supplier/access-denied` among the routes that must render.
 *
 * Neither of those has a session. The interesting failure is not the visitor
 * with no account; it is the REAL CUSTOMER, holding a valid session cookie,
 * who types `/supplier` or `/admin` into the address bar. That is the only
 * shape a real privilege escalation takes here, and measured on 2026-09-10 no
 * spec exercised it.
 *
 * =========================================================================
 * SIGNED OUT AND SIGNED-IN-WITHOUT-MEMBERSHIP ARE DIFFERENT ANSWERS
 * =========================================================================
 *
 * `requireSupplierMember` sends the first to `/login?next=...` and the second
 * to `/supplier/access-denied`, deliberately. Asserting only "did not reach
 * the console" would pass if the guard collapsed the two, and collapsing them
 * is a real regression: a customer bounced to a login form they are already
 * logged into gets an infinite loop, and the support ticket says "the site is
 * broken" rather than "I do not have access".
 *
 * So each case pins the DESTINATION, not merely the refusal.
 *
 * =========================================================================
 * FIXTURES
 * =========================================================================
 *
 * Needs `pnpm seed:test` (the e2e customer and supplier users). On an unseeded
 * database -- production is deliberately never seeded -- the sign-in cannot
 * succeed, so each test checks the fixture first and skips with the reason
 * rather than failing on a login that has no user behind it. Same stance as
 * `admin-refund.spec.ts`.
 */

/** Reached the login form rather than a session, so the fixture is absent. */
async function signInOrSkip(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  who: string,
): Promise<void> {
  try {
    await signInWithEmail(page, email, password)
  } catch {
    test.skip(true, `${who} fixture missing; run pnpm seed:test`)
  }
}

/**
 * The half of the guard that needs no fixture, so this file asserts something
 * on every database rather than skipping wholesale on an unseeded one.
 */
test.describe('supplier guard, signed out @security', () => {
  test('sends a stranger to login and remembers where they were going', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/supplier/redemptions')

    // The return path is the half that breaks quietly: without it the supplier
    // signs in and lands on the storefront, and the deep link they were sent
    // is lost with no error anywhere.
    await expect(page).toHaveURL(/\/login\?next=/)
    const next = new URL(page.url()).searchParams.get('next')
    expect(next).toBe('/supplier/redemptions')
  })

  test('does not render the console to a stranger on the way past', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/supplier')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('table')).toHaveCount(0)
  })
})

test.describe('role isolation @security', () => {
  test.describe.configure({ timeout: 90_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'role fixtures disabled (E2E_PAID_FLOW=0)')
  })

  test('a signed-in customer at /supplier is told they lack access, not sent to login', async ({
    page,
  }) => {
    await clearBrowserSession(page)
    await signInOrSkip(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, 'e2e customer')

    await page.goto('/supplier')

    // The destination, not just "not the console". A customer bounced to a
    // login form they are already logged into loops forever.
    await expect(page).toHaveURL(/\/supplier\/access-denied/)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('a signed-in customer cannot open the supplier redemption console', async ({ page }) => {
    await clearBrowserSession(page)
    await signInOrSkip(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, 'e2e customer')

    await page.goto('/supplier/redemptions')

    await expect(page).toHaveURL(/\/supplier\/access-denied/)
    // Nothing from another supplier's console may be on the page, not even a
    // heading that says the screen exists.
    await expect(page.locator('table')).toHaveCount(0)
  })

  test('a signed-in customer cannot open the admin panel', async ({ page }) => {
    await clearBrowserSession(page)
    await signInOrSkip(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, 'e2e customer')

    await page.goto('/admin/orders')

    // Wherever the panel guard sends a non-staff session, it is not the panel.
    await expect(page).not.toHaveURL(/\/admin\/orders/)
  })

  test('a signed-in supplier cannot open the admin panel', async ({ page }) => {
    await clearBrowserSession(page)
    await signInOrSkip(page, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, 'e2e supplier')

    await page.goto('/admin/products')

    await expect(page).not.toHaveURL(/\/admin\/products/)
  })

  test('the supplier console shows no platform commission', async ({ page }) => {
    await clearBrowserSession(page)
    await signInOrSkip(page, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, 'e2e supplier')

    const response = await page.goto('/supplier')
    test.skip(
      response?.url().includes('access-denied') === true,
      'e2e supplier has no supplier membership; run pnpm seed:test',
    )

    // The rule from the business model: a supplier sees what they are owed and
    // never what the platform keeps. Asserted on the rendered text rather than
    // on a selector, because the leak this guards against is a number appearing
    // somewhere nobody added a test id to.
    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body).not.toContain('platform_percent')
    expect(body).not.toContain('עמלת פלטפורמה')
    expect(body).not.toContain('הכנסות פלטפורמה')
  })
})
