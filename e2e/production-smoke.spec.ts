import { expect, test } from '@playwright/test'
import { addOpenProductToCart, openPurchasableProduct } from './helpers'

/**
 * The guest purchase path, run against the REAL deployment.
 *
 * Every other spec in this directory runs against a build on this machine. This
 * one is meant for `E2E_BASE_URL=https://kenyonexpress.vercel.app`, and the
 * difference is the point: it exercises the production catalogue, the
 * production Supabase, and the proxy as Vercel actually runs it. A build can be
 * green locally and still be serving a catalogue where nothing is buyable.
 *
 * WHAT IT WRITES, AND WHY THAT IS ACCEPTABLE
 *
 * One guest cart row, keyed by the `ke_session_id` cookie. No account, no
 * order, no voucher, no payment. `/api/cron/reap-carts` deletes expired guest
 * carts nightly, so the row is self-cleaning. It deliberately stops at the
 * checkout form and never presses pay: the specs that create orders and
 * redeem vouchers must not point at a live commerce database.
 */

/**
 * ILS AS THE APP ACTUALLY PRINTS IT: THE DIGITS FIRST, THEN THE SIGN.
 *
 * This used to read `/₪\s?([\d,]+...)/` -- sign first -- and that is why this
 * spec failed with "the order summary printed no shekel amount" against a cart
 * that was rendering prices perfectly well. The app has not emitted that order
 * since 2026-09-04. `lib/money-format.ts` emits
 * `U+2066 1,234.50 U+00A0 ₪ U+2069`, and its header records the measurement
 * behind every character: the sign goes to the RIGHT of the digits in an RTL
 * document, a plain space lets the bidi algorithm migrate it back to the left,
 * and the isolate is what pins it. Sign-first was the reported defect, not the
 * contract.
 *
 * So the assertion was wrong and the app was right, which is the only reason
 * to change the test rather than the code. `\s` matches the NBSP, and the
 * isolates are zero-width and fall outside the match.
 */
const ILS = /([\d,]+(?:\.\d{1,2})?)\s?₪/

/** The fraction digits of a printed price, or undefined when it prints whole. */
const ILS_FRACTION = /[\d,]+\.(\d+)\s?₪/

function parseIls(text: string): number | null {
  const match = ILS.exec(text)
  if (!match?.[1]) return null
  return Number(match[1].replace(/,/g, ''))
}

test.describe('production smoke: guest cart to checkout', () => {
  test('a guest can put a real product in the cart and reach the checkout form', async ({
    page,
  }) => {
    // 1. A product the live catalogue actually sells. `openPurchasableProduct`
    //    walks /products and stops at the first with an enabled buy button, so
    //    a catalogue where nothing is buyable fails here with that sentence
    //    rather than somewhere further down looking like a UI bug.
    await openPurchasableProduct(page)
    const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim()
    expect(name, 'the product page rendered no title').toBeTruthy()

    const cartButton = page.getByRole('button', { name: /עגלת קניות, \d+ פריטים/ }).first()
    const before = Number(
      /עגלת קניות, (\d+) פריטים/.exec((await cartButton.getAttribute('aria-label')) ?? '')?.[1] ??
        0,
    )

    // 2. Add to cart, and require the COUNTER to move. A button that responds
    //    and a button that is dead look identical without this.
    await addOpenProductToCart(page)
    await expect
      .poll(
        async () =>
          Number(
            /עגלת קניות, (\d+) פריטים/.exec(
              (await cartButton.getAttribute('aria-label')) ?? '',
            )?.[1] ?? 0,
          ),
        { timeout: 15_000, message: 'the header cart counter never advanced' },
      )
      .toBeGreaterThan(before)

    // 3. The cart shows the product and a total.
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    if (name) await expect(page.getByText(name, { exact: false }).first()).toBeVisible()

    const summary = page.getByRole('complementary', { name: 'סיכום הזמנה' })
    await expect(summary).toBeVisible()

    // 4. THE MONEY INVARIANT. Every amount on the summary has to be a whole
    //    number of agorot, which on screen means at most two decimal places.
    //    A float leaking into the money path shows up here as 8.199999999999999
    //    long before anyone notices a rounding drift in a payout.
    const amounts = await summary.getByText(ILS).allTextContents()
    expect(amounts.length, 'the order summary printed no shekel amount').toBeGreaterThan(0)
    for (const raw of amounts) {
      const decimals = ILS_FRACTION.exec(raw)?.[1]
      expect(decimals?.length ?? 0, `"${raw}" is not a whole number of agorot`).toBeLessThanOrEqual(
        2,
      )
      const value = parseIls(raw)
      expect(value, `"${raw}" did not parse as a number`).not.toBeNull()
      expect(value ?? -1).toBeGreaterThanOrEqual(0)
    }

    // 5. The on-site total is labelled. For a coupon this line IS the split:
    //    what the shopper pays here versus what they settle at the merchant.
    await expect(summary.getByText('לתשלום באתר')).toBeVisible()

    // 6. A guest reaches the checkout FORM. /checkout takes guests by decision;
    //    identity is demanded on the pay press, not at the door. This stops at
    //    the form and does not pay.
    const cta = page.getByRole('link', { name: /המשך לתשלום/ }).first()
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible()
  })

  /**
   * The coupon split, when the catalogue has a coupon to split.
   *
   * Measured on 2026-09-01: production holds 45 active products and every one
   * is `type = 'physical'`. All fifteen coupon-type products were demo data and
   * migration 128 retired them. So this cannot assert a split today, and it
   * SKIPS WITH THAT REASON rather than passing and implying it checked
   * something. The moment a real coupon product is published it starts running.
   */
  test('a coupon product shows the on-site portion separately', async ({ page }) => {
    await page.goto('/coupons')
    const couponLinks = page.locator('a[href^="/product/"]')
    const count = await couponLinks.count().catch(() => 0)
    test.skip(
      count === 0,
      'the live catalogue has no coupon-type product: all 15 were demo data and 128 retired them',
    )

    await couponLinks.first().click()
    await addOpenProductToCart(page)
    await page.goto('/cart')
    const summary = page.getByRole('complementary', { name: 'סיכום הזמנה' })
    await expect(summary.getByText('לתשלום באתר')).toBeVisible()
  })
})
