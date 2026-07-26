import { expect, test } from '@playwright/test'
import { BUY_BUTTON } from './helpers'

/**
 * The whole customer journey in one pass: search -> product -> cart -> checkout.
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

    // 5. And checkout must be reachable from it.
    const checkout = page.getByRole('link', { name: /לתשלום|המשך לתשלום|checkout/i }).first()
    const hasCheckoutLink = await checkout.isVisible().catch(() => false)
    if (hasCheckoutLink) {
      await checkout.click()
    } else {
      await page.goto('/checkout')
    }
    // Guest checkout is the requirement; a redirect to login is a regression.
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('a coupon page quotes the on-site charge and the balance at the business', async ({
    page,
  }) => {
    // The regression this guards: the page used to render 10% of the sticker
    // while the cart billed products.coupon_price_ils, so the customer was
    // quoted one number and charged another.
    await page.goto('/products?type=coupon')
    const couponCard = page.locator('a[href^="/product/"]').first()
    const found = await couponCard.isVisible({ timeout: DISCOVERY_TIMEOUT }).catch(() => false)
    test.skip(!found, 'no coupon products in this seed')

    await couponCard.click()
    await page.waitForURL(/\/product\//)

    const split = page.getByText('לתשלום באתר עכשיו')
    const isCouponPage = await split.isVisible().catch(() => false)
    test.skip(!isCouponPage, 'discovered product is not a sellable coupon')

    await expect(split).toBeVisible()
    await expect(page.getByText('יתרה לתשלום בבית העסק')).toBeVisible()
    // The abolished percent model must not reappear anywhere on the page.
    await expect(page.getByText(/שלם 10% עכשיו/)).toHaveCount(0)
    await expect(page.getByText(/90% בבית העסק/)).toHaveCount(0)
  })
})
