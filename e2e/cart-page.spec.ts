import { expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'
import { addOpenProductToCart, openPurchasableProduct } from './helpers'

/**
 * UX16 (14.10.2026): THE SHOPPING CART PAGE AS A SET OF CONTROLS, read off the
 * rendered page with one real line in the basket.
 *
 * Measured before (logs/ux16/before.json): a plus press moved the field, the
 * line total and the summary with nothing announced and nothing pulsed; the
 * remove press took the row out of the DOM within one frame; the summary was
 * two rows and a total with no live region, no VAT note and no breakdown.
 *
 * Now: the quantity change is answered in a live region and the totals pulse;
 * the row is marked `data-leaving` and animates out before the store write;
 * the summary carries a note under the items row when products and units
 * differ, a closed per-product disclosure, the VAT note and a polite live
 * region on the on-site figure.
 */

type Page = import('@playwright/test').Page

/** Consent decided through the cookie the server reads, so no banner covers the sidebar. */
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

test.describe('cart page controls (UX16)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await page.goto('/cart')
    await expect(page.locator('.cart-line').first()).toBeVisible()
  })

  test('a plus press is answered by the live region, the meta line and the total', async ({
    page,
  }) => {
    const line = page.locator('.cart-line').first()
    const field = line.getByRole('spinbutton')
    const total = page.locator('.cart-sidebar__total strong')
    await expect(total).toHaveAttribute('aria-live', 'polite')
    const before = (await total.textContent()) ?? ''
    await expect(line.getByTestId('cart-line-meta')).toHaveCount(0)

    await line.getByRole('button', { name: 'הוסף כמות' }).click()

    await expect(field).toHaveValue('2')
    await expect(line.locator('.cart-line__announce')).toHaveText(/עודכנה ל-2/)
    await expect(total).not.toHaveText(before)
    await expect(line.getByTestId('cart-line-meta')).toHaveText(/× 2/)
    await expect(page.getByText('פריטים (2)')).toBeVisible()
    // Two units of one product: the note names both counts and the
    // disclosure appears.
    await expect(page.locator('.cart-sidebar__row-note')).toHaveText('מוצר אחד, 2 יחידות')
    const details = page.getByTestId('cart-breakdown')
    await expect(details).toBeVisible()
    await expect(details).not.toHaveAttribute('open', '')
    await details.locator('summary').click()
    await expect(details.locator('.cart-sidebar__breakdown-item')).toHaveCount(1)
    await expect(details.locator('.cart-sidebar__breakdown-calc')).toHaveText(/^2 ×/)
  })

  test('the summary says prices include VAT and shows no savings without a discount', async ({
    page,
  }) => {
    const summary = page.getByRole('complementary', { name: 'סיכום הזמנה' })
    await expect(summary.getByText('המחירים כוללים מע״מ')).toBeVisible()
    await expect(summary.getByTestId('cart-savings-row')).toHaveCount(0)
    await expect(summary.getByTestId('cart-saved-line')).toHaveCount(0)
    await expect(summary.getByTestId('cart-grand-total')).toHaveCount(0)
  })

  test('the remove press marks the row as leaving before it goes, then the cart is empty', async ({
    page,
  }) => {
    const line = page.locator('.cart-line').first()
    // Stretch the exit so the attribute is observable from outside: the
    // assertion is about the order of events, not the 240ms.
    await page.addStyleTag({
      content: '.cart-line[data-leaving]{animation-duration:1500ms !important}',
    })
    const remove = line.getByRole('button', { name: /^הסר .* מהעגלה$/ })
    await remove.click()

    await expect(line).toHaveAttribute('data-leaving', 'true')
    await expect(line).toHaveAttribute('aria-busy', 'true')
    await expect(line.getByRole('button', { name: 'הוסף כמות' })).toBeDisabled()
    // Still in the DOM while leaving: the store has not been written yet.
    await expect(line).toHaveCount(1)

    await expect(page.locator('.cart-line')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByText('סל הקניות שלך ריק כרגע.')).toBeVisible()
  })

  test('with motion reduced the row still leaves and the cart still empties', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    const line = page.locator('.cart-line').first()
    await expect(line).toBeVisible()
    await line.getByRole('button', { name: /^הסר .* מהעגלה$/ }).click()
    await expect(page.locator('.cart-line')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByText('סל הקניות שלך ריק כרגע.')).toBeVisible()
  })
})
