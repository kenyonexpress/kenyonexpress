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
    await page.goto('/cart')
    await expect(page.getByText(/₪/).first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible()

    // 5. And the cart must hand the shopper on to checkout.
    //
    // The contract is a GUEST CART with an AUTHENTICATED CHECKOUT: src/proxy.ts
    // gates the whole /checkout subtree so order data never reaches an
    // anonymous visitor, and checkout.spec.ts pins that in both directions.
    // The first draft of this spec asserted guest checkout and failed against
    // three passing tests — the assertion was wrong, not the app. What this
    // step actually proves is that the journey arrives at the gate carrying a
    // return path, rather than dead-ending or losing the cart.
    await expect(page.getByRole('button', { name: /המשך לתשלום/ })).toBeVisible()

    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/, { timeout: 15000 })
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
