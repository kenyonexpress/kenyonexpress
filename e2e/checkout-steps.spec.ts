import { expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'
import { addOpenProductToCart, openPurchasableProduct } from './helpers'

/**
 * UX17 (14.10.2026): THE CHECKOUT AS THREE STEPS, read off the rendered page
 * with one real line in the basket.
 *
 * Measured before (logs/ux17/before.json): no rail, every section open at
 * once, the street a plain input that offered nothing under typing, the
 * payment block one read-only line, and the pay button 3065px down at 380.
 *
 * Now: a rail names the open step; one step's body is open at a time while
 * every field stays in the DOM; "continue" judges its own step and marks what
 * is missing; the street field is a combobox that asks /api/checkout/streets
 * once typing pauses; the payment step is a radio group of methods under
 * `token_id` with the pay button under it; and the one submit still judges the
 * whole form and opens the step that owns the first error.
 */

type Page = import('@playwright/test').Page

/** Consent decided through the cookie the server reads, so no banner covers the form. */
async function preset(page: Page) {
  const base = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000')
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE,
      value: serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION }),
      domain: base.hostname,
      path: '/',
    },
  ])
}

const DETAILS = [
  ['#co-first-name', 'אופיר'],
  ['#co-last-name', 'בדיקה'],
  ['#co-phone', '0501234567'],
  ['#co-email', 'qa@example.com'],
] as const

async function fillDetails(page: Page) {
  for (const [selector, value] of DETAILS) await page.fill(selector, value)
}

const current = (page: Page) => page.locator('.checkout-steps__item[aria-current="step"]')
const next = (page: Page) => page.getByRole('button', { name: 'המשך', exact: true })

test.describe('checkout steps (UX17)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await page.goto('/checkout')
    await page.waitForLoadState('domcontentloaded')
    expect(page.url(), 'checkout bounced to the cart; the seed did not stick').toContain(
      '/checkout',
    )
  })

  test('opens on the first step with a rail, and keeps the other steps closed', async ({
    page,
  }) => {
    // `nav.`: the Suspense shell reserves the rail's box under the same class
    // and may still be in the DOM while the body streams in.
    await expect(page.locator('nav.checkout-steps')).toBeVisible()
    await expect(current(page)).toContainText('פרטים אישיים')
    await expect(page.locator('.checkout-steps__item')).toHaveCount(3)
    await expect(page.locator('#co-first-name')).toBeVisible()
    await expect(page.locator('#co-city')).toBeHidden()
    await expect(page.locator('.checkout-pay-btn')).toBeHidden()
    // In the DOM all the same, so the one submit can read them.
    await expect(page.locator('#co-city')).toHaveCount(1)
    await expect(page.locator('input[name="accept_terms"]')).toHaveCount(1)
    // The order review is beside the steps from the first one.
    await expect(page.locator('[aria-label="ההזמנה שלך"]')).toBeVisible()
  })

  test('"continue" on an empty step marks its four fields and stays', async ({ page }) => {
    await next(page).click()
    await expect(page.locator('.checkout-field__error')).toHaveCount(4)
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(4)
    await expect(current(page)).toContainText('פרטים אישיים')
    // Focus landed on the first wrong field.
    await expect(page.locator('#co-first-name')).toBeFocused()
  })

  test('walks forward, keeps a summary of each done step, and can go back by the rail', async ({
    page,
  }) => {
    await fillDetails(page)
    await next(page).click()
    await expect(current(page)).toContainText('כתובת למשלוח')
    await expect(page.getByTestId('step-summary-details')).toContainText('אופיר בדיקה')
    await expect(page.getByTestId('step-summary-details')).toContainText('0501234567')
    await expect(page.locator('#co-city')).toBeVisible()

    await page.fill('#co-city', 'תל אביב')
    await page.fill('#co-street', 'דיזנגוף')
    await page.fill('#co-number', '10')
    await next(page).click()
    await expect(current(page)).toContainText('תשלום')
    await expect(page.getByTestId('step-summary-address')).toHaveText('דיזנגוף 10, תל אביב')
    await expect(page.locator('.checkout-pay-btn')).toBeVisible()
    await expect(page.locator('.checkout-steps__item[data-state="done"]')).toHaveCount(2)

    // Back by the rail: the first step reopens with its values intact.
    await page.locator('.checkout-steps__btn').first().click()
    await expect(current(page)).toContainText('פרטים אישיים')
    await expect(page.locator('#co-first-name')).toHaveValue('אופיר')
    await expect(page.locator('.checkout-steps__item[data-state="upcoming"]')).toHaveCount(2)
  })

  test('the street field is a combobox that asks the registry once typing pauses', async ({
    page,
  }) => {
    await fillDetails(page)
    await next(page).click()
    const street = page.locator('#co-street')
    await expect(street).toHaveAttribute('role', 'combobox')
    await expect(street).toHaveAttribute('aria-autocomplete', 'list')

    await page.fill('#co-city', 'תל אביב')
    const asked = page.waitForRequest(
      (request) => request.url().includes('/api/checkout/streets?'),
      { timeout: 10_000 },
    )
    await street.click()
    await street.pressSequentially('דיז', { delay: 30 })
    const request = await asked
    const url = new URL(request.url())
    expect(url.searchParams.get('city')).toBe('תל אביב')
    expect(url.searchParams.get('q')).toBe('דיז')

    // Whatever the registry answered (it may be unreachable from the runner),
    // the typed value stands and the field never refuses it.
    const response = await request.response()
    expect(response?.status()).toBe(200)
    const payload = (await response?.json()) as { streets: string[] }
    expect(Array.isArray(payload.streets)).toBe(true)
    if (payload.streets.length > 0) {
      await expect(street).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('[role="option"]').first()).toContainText('דיזנגוף')
      await page.locator('[role="option"]').first().click()
      await expect(street).toHaveValue(/דיזנגוף/)
    } else {
      await expect(street).toHaveValue('דיז')
    }
  })

  test('the payment step offers the method as a radio group with the pay button under it', async ({
    page,
  }) => {
    await fillDetails(page)
    await next(page).click()
    await page.fill('#co-city', 'תל אביב')
    await page.fill('#co-street', 'דיזנגוף')
    await page.fill('#co-number', '10')
    await next(page).click()

    const methods = page.getByTestId('payment-methods')
    await expect(methods).toBeVisible()
    await expect(methods.locator('legend')).toHaveText('אמצעי תשלום')
    const radios = methods.locator('input[name="token_id"]')
    await expect(radios).toHaveCount(1)
    await expect(radios.first()).toBeChecked()
    await expect(radios.first()).toHaveValue('new')
    await expect(methods.locator('.checkout-methods__option[data-selected="true"]')).toHaveCount(1)
    await expect(methods.locator('[role="img"]').first()).toBeVisible()

    const pay = page.locator('.checkout-pay-btn')
    await expect(pay).toBeVisible()
    const payBox = await pay.boundingBox()
    const methodsBox = await methods.boundingBox()
    expect(payBox && methodsBox && payBox.y > methodsBox.y).toBe(true)
    await expect(page.getByRole('button', { name: 'חזרה' })).toBeVisible()
  })

  test('the one submit judges the whole form and opens the step that owns the first error', async ({
    page,
  }) => {
    // With the provider gate closed (a local build without Cardcom
    // credentials) the submit handler stops before judging anything, by
    // design; the whole-form check is then pinned by multi-step-checkout
    // .test.tsx alone.
    test.skip(
      (await page.locator('form.checkout-page__grid').getAttribute('data-payment-gate')) ===
        'closed',
      'payment gate closed on this build',
    )
    await fillDetails(page)
    await next(page).click()
    await page.fill('#co-city', 'תל אביב')
    await page.fill('#co-street', 'דיזנגוף')
    await page.fill('#co-number', '10')
    await next(page).click()
    await expect(current(page)).toContainText('תשלום')

    // Break the first step from behind, then submit from the third.
    await page.evaluate(() => {
      const email = document.querySelector<HTMLInputElement>('#co-email')
      if (email) email.value = 'broken'
    })
    await page.locator('form.checkout-page__grid').evaluate((form) => {
      ;(form as HTMLFormElement).requestSubmit()
    })
    await expect(current(page)).toContainText('פרטים אישיים')
    await expect(page.locator('#co-email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#co-email')).toBeFocused()
  })
})
