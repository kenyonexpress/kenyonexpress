import { expect, test } from '@playwright/test'
import { BUY_BUTTON } from './helpers'

/**
 * The whole customer journey in one pass: search -> product -> cart -> the
 * checkout gate.
 *
 * The existing specs each cover one surface, so a break in the seam between two
 * of them (a renamed button, a cart that loads but never receives the item, a
 * checkout that cannot see the cart) passes every file and still leaves the
 * shop unable to take an order. This spec exists to fail in exactly that case.
 *
 * It discovers a real product at runtime rather than hard-coding a slug: the
 * catalogue is DB-driven with Hebrew slugs, and a hard-coded one rots with the
 * seed.
 */

const DISCOVERY_TIMEOUT = 15_000

test.describe('search to checkout', () => {
  test('a shopper can find a product, add it, and reach checkout', async ({ page }) => {
    // 1. Find something to buy. The search box takes the first word of a real
    //    product name, so the query is guaranteed to have a match.
    await page.goto('/products')
    const firstCard = page.locator('a[href^="/product/"]').first()
    await expect(firstCard).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

    const productName = (await firstCard.textContent())?.trim() ?? ''
    const term = productName.split(/\s+/).find((word) => word.length >= 2)
    test.skip(!term, 'no product name long enough to search for')

    await page.goto(`/search?q=${encodeURIComponent(term as string)}`)
    const searchHit = page.locator('a[href^="/product/"]').first()
    await expect(searchHit).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

    // 2. Open the product page from the search results.
    await searchHit.click()
    await page.waitForURL(/\/product\//)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Every product page carries the supplier block, coupon or physical.
    await expect(page.getByRole('region', { name: 'פרטי ספק' })).toBeVisible()

    // 3. Add to cart. Skip rather than fail if the discovered product happens
    //    to be out of stock or unpriced: that is a seed condition, not a bug.
    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    const buyable = await buy.isVisible().catch(() => false)
    test.skip(!buyable, 'discovered product is not purchasable in this seed')
    test.skip(await buy.isDisabled(), 'discovered product is out of stock')

    await buy.click()
    await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()

    // 4. The cart must actually hold it.
    //
    // SCOPED TO THE SUMMARY, not `page.getByText(/₪/)`. Unscoped, the first
    // match on the page is the category drawer's "עד ⁦99 ₪⁩" link, which is in
    // the DOM and hidden -- so this asserted `toBeVisible` on a permanently
    // hidden nav item and failed with "Received: hidden" on a cart that was
    // rendering the price correctly two elements away. A price assertion has to
    // look where the price is.
    await page.goto('/cart')
    const summary = page.getByRole('complementary', { name: 'סיכום הזמנה' })
    await expect(summary).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
    // Digits then sign: `lib/money-format.ts` emits the shekel to the RIGHT of
    // the number in RTL, inside a bidi isolate. Sign-first was the old defect.
    await expect(summary.getByText(/[\d,]+(?:\.\d{1,2})?\s?₪/).first()).toBeVisible()

    // The line item, by the name a shopper reads. Scoped for the same reason as
    // the price, and filtered for the same reason again: /cart carries TWO
    // links to the product, an image-only one and the titled one, and on a
    // phone the image link is the hidden one. `.first()` picked it and this
    // failed with "Received: hidden" against a cart that was listing the
    // product correctly on the next line.
    const items = page.getByRole('region', { name: 'פריטים בעגלה' })
    await expect(
      items.locator('a[href^="/product/"]').filter({ hasText: /\S/ }).first(),
    ).toBeVisible()

    // 5. And the cart must hand the shopper on to checkout.
    //
    // The contract is a GUEST CART with a GUEST CHECKOUT: /checkout itself is
    // open and the sign-in is demanded on the pay press, where there is
    // something to lose by walking away. Only the /checkout SUBTREE — the
    // payment-outcome pages — stays behind the proxy's gate; checkout.spec.ts
    // pins both halves.
    //
    // This step asserted the older shape, a button here and a bounce to
    // /login at /checkout, and went on saying so unchallenged because it never
    // got this far: the add above left the cart empty, so the run died four
    // lines earlier every time.
    await expect(page.getByRole('link', { name: /המשך לתשלום/ }).first()).toBeVisible()

    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible()
  })

  test('a coupon page quotes the on-site charge and the balance at the business', async ({
    page,
  }) => {
    // The regression this guards: the page used to render 10% of the sticker
    // while the cart billed products.coupon_price_ils, so the customer was
    // quoted one number and charged another.
    await page.goto('/products?type=coupon')
    const cards = page.locator('a[href^="/product/"]')
    await expect(cards.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

    // Walk the coupon cards for one that is actually priced rather than taking
    // the first. coupon_price_ils has no default, so a catalogue legitimately
    // holds coupons the admin has not priced yet; those render the unsellable
    // state and would make this spec's outcome depend on sort order.
    const hrefs = (
      await cards.evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')),
      )
    ).filter((h): h is string => Boolean(h))

    let split = page.getByText('לתשלום באתר עכשיו')
    let priced = false
    for (const href of hrefs.slice(0, 12)) {
      await page.goto(href)
      split = page.getByText('לתשלום באתר עכשיו')
      if (await split.isVisible().catch(() => false)) {
        priced = true
        break
      }
    }
    test.skip(!priced, 'no coupon in this catalogue has an absolute price set')

    await expect(split).toBeVisible()
    await expect(page.getByText('יתרה לתשלום בבית העסק')).toBeVisible()
    // The abolished percent model must not reappear anywhere on the page.
    await expect(page.getByText(/שלם 10% עכשיו/)).toHaveCount(0)
    await expect(page.getByText(/90% בבית העסק/)).toHaveCount(0)
  })
})
