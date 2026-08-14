import { type Page, expect } from '@playwright/test'
import { E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, signInWithEmail } from './auth-session'
import { FIXTURE_SLUGS } from './db'

/**
 * The shared leg of every money-path spec: a signed-in fixture customer with a
 * fixture product in the cart, standing on the checkout form with the pay
 * button pressed.
 *
 * It lives outside the specs because two of them need the same twelve steps and
 * neither is about those steps: cardcom-redirect.spec.ts is about the provider
 * hop, coupon-settlement.spec.ts is about the rows the hop writes. Duplicating
 * the drive would make a change to the checkout form fail in both files for a
 * reason that is in neither.
 */

const PAY_BUTTON = 'מעבר לתשלום מאובטח'
const FRAME_REGION = 'תשלום מאובטח'

/** Puts the named fixture product in the cart of whoever is driving `page`. */
export async function addFixtureToCart(page: Page, slug: string): Promise<void> {
  const response = await page.goto(`/product/${slug}`)
  if (response?.status() !== 200) {
    throw new Error(`fixture /product/${slug} is missing; run pnpm seed:test`)
  }

  const buy = page
    .locator('[data-pdp="summary"]')
    .getByRole('button', { name: /הוסף לסל|קנה עכשיו/ })
    .first()
  await expect(buy).toBeVisible({ timeout: 15_000 })
  await expect(buy).toBeEnabled()
  await buy.click()

  // The optimistic store raises the badge in about 2ms and settles later; the
  // button coming back out of pending is the server's answer. See the long note
  // on addOpenProductToCart in helpers.ts, which this mirrors deliberately.
  await expect(buy).toBeEnabled({ timeout: 15_000 })
}

/** True when the fixture product page and buy button are actually there. */
export async function fixtureIsPurchasable(page: Page, slug: string): Promise<boolean> {
  const response = await page.goto(`/product/${slug}`)
  if (response?.status() !== 200) return false
  const buy = page
    .locator('[data-pdp="summary"]')
    .getByRole('button', { name: /הוסף לסל|קנה עכשיו/ })
    .first()
  return await buy.isEnabled({ timeout: 5_000 }).catch(() => false)
}

/**
 * Signs in the fixture customer, buys the coupon fixture and presses pay.
 * Returns the `src` the payment iframe was given, which is the provider's
 * hosted-page URL.
 *
 * Deliberately does NOT wait for /checkout/return. Reaching the provider and
 * coming back from it are two different facts, and one spec here cares only
 * about the first.
 */
export async function pressPayForCouponFixture(page: Page): Promise<string> {
  await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/')
  await addFixtureToCart(page, FIXTURE_SLUGS.coupon)

  await page.goto('/checkout')
  await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 })

  await page.locator('input[name="accept_terms"]').check()

  const pay = page.getByRole('button', { name: PAY_BUTTON })
  // The form is a wizard on narrow layouts. Advance until the pay button is on
  // screen rather than assuming a single-step form, so this helper serves the
  // phone project as well as the desktop one.
  for (let i = 0; i < 3 && !(await pay.isVisible().catch(() => false)); i += 1) {
    const next = page.getByRole('button', { name: /המשך לאישור|המשך/ }).first()
    if (!(await next.isVisible().catch(() => false))) break
    await next.click()
  }

  await expect(pay).toBeVisible({ timeout: 15_000 })
  await pay.click()

  const frame = page.getByRole('region', { name: FRAME_REGION })
  await expect(frame).toBeVisible({ timeout: 45_000 })

  const src = await frame.locator('iframe').getAttribute('src')
  if (!src) throw new Error('payment frame rendered without a src')
  return src
}

/**
 * Follows the mock provider's redirect through to the success page and returns
 * the order id the return page was called with.
 *
 * The iframe navigates itself to /checkout/return and the breakout component
 * moves the top window there, so the wait is on the TOP-level URL.
 */
export async function completeMockPayment(page: Page): Promise<string> {
  await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: 45_000 })
  await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
    timeout: 45_000,
  })

  const orderId = new URL(page.url()).searchParams.get('order_id')
  if (!orderId) throw new Error('/checkout/return carried no order_id')
  return orderId
}
