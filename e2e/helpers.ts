import { type Page, expect } from '@playwright/test'

/**
 * Catalog content is DB-driven and the slugs are Hebrew, so specs discover a
 * real product or category at runtime instead of hard-coding a demo slug that
 * rots the moment the seed changes.
 */

const DISCOVERY_TIMEOUT = 15_000

export async function firstProductHref(page: Page): Promise<string> {
  await page.goto('/products')
  const link = page.locator('a[href^="/product/"]').first()
  await expect(link).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
  const href = await link.getAttribute('href')
  if (!href) throw new Error('product link has no href')
  return href
}

/** Opens the first product in the catalog, whatever its stock. */
export async function openFirstProduct(page: Page): Promise<void> {
  await page.goto('/products')
  const link = page.locator('a[href^="/product/"]').first()
  await expect(link).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
  await link.click()
  await page.waitForURL(/\/product\//)
}

/**
 * Opens a product that can actually be bought, which is a different question
 * from opening the first one.
 *
 * The first product in the local catalog is `demo-prod-03`, stock_quantity 0,
 * so its buy button reads "אזל מהמלאי" and is disabled. The cart specs then
 * clicked the first button matching BUY_BUTTON anywhere on the page - and with
 * the real one disabled and differently labelled, that was a RELATED PRODUCT's
 * card button. The specs added product B and asserted product A's name appeared
 * in the cart.
 *
 * Being out of stock is correct behaviour and is not what those specs are for,
 * so this walks the catalog for an enabled one. Only the specs that need to buy
 * pay the extra page loads; the product-page specs keep using
 * openFirstProduct.
 */
export async function openPurchasableProduct(page: Page): Promise<void> {
  await page.goto('/products')
  const links = page.locator('a[href^="/product/"]')
  await expect(links.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

  const hrefs: string[] = []
  const count = await links.count()
  for (let i = 0; i < count; i += 1) {
    const href = await links.nth(i).getAttribute('href')
    if (href && !hrefs.includes(href)) hrefs.push(href)
  }

  // Bounded: a seed where none of the first few is buyable is a seed problem,
  // and walking all of it would blow the per-test timeout instead of saying so.
  for (const href of hrefs.slice(0, 6)) {
    await page.goto(href)
    const enabled = await buyButton(page)
      .isEnabled({ timeout: 2_000 })
      .catch(() => false)
    if (enabled) return
  }

  throw new Error('no purchasable product among the first 6 in the catalog')
}

/**
 * The product's own buy button, scoped to the summary block.
 *
 * Unscoped, `.first()` can resolve to a related-product card lower down the
 * page, which is a different product entirely.
 */
function buyButton(page: Page) {
  return page.locator('[data-pdp="summary"]').getByRole('button', { name: BUY_BUTTON }).first()
}

/**
 * Returns the slug of a category that actually has products, discovered from
 * the homepage navigation. Returns null when the catalog exposes no category
 * links at all, which lets a spec skip rather than fail on an empty seed.
 */
export async function firstCategorySlug(page: Page): Promise<string | null> {
  await page.goto('/')
  const links = page.locator('a[href^="/category/"]')
  await expect(links.first())
    .toBeVisible({ timeout: DISCOVERY_TIMEOUT })
    .catch(() => undefined)

  const count = await links.count()
  const candidates: string[] = []
  for (let i = 0; i < count; i += 1) {
    const href = await links.nth(i).getAttribute('href')
    const slug = href?.split('?')[0]?.replace('/category/', '')
    if (slug && !candidates.includes(slug)) candidates.push(slug)
  }

  // Returning the first link was not the same thing as this function's
  // contract, which is "a category that actually has products". The homepage
  // promo banners hardcode /category/hot-deals and /category/phones-computers
  // (src/components/home/HeroPromoBanners.tsx); neither slug exists in the
  // local seed, and both sort ahead of the real navigation links. Seven
  // category specs were therefore asserting against a 404 page, and reported
  // it as a missing breadcrumb rather than as a dead link.
  //
  // Each candidate is now visited before being handed back. A slug that 404s
  // is skipped rather than returned, so the specs test the archive and the
  // dead banners stay a separate, visible problem.
  for (const slug of candidates) {
    const response = await page.goto(`/category/${slug}`)
    if (response?.status() === 200) return slug
  }
  return null
}

/**
 * The purchase button's label depends on the product: a coupon says "קנה עכשיו"
 * (it is a single-item purchase, priced by the absolute coupon model), anything
 * else says "הוסף לסל". Specs match either rather than assuming a product type,
 * because the seed decides which one they land on.
 */
export const BUY_BUTTON = /הוסף לסל|קנה עכשיו/

/** Reads the item count the header badge advertises via its aria-label. */
async function headerCartCount(page: Page): Promise<number> {
  const label = await page
    .getByRole('button', { name: /עגלת קניות, \d+ פריטים/ })
    .first()
    .getAttribute('aria-label')
    .catch(() => null)
  const match = /עגלת קניות, (\d+) פריטים/.exec(label ?? '')
  return match ? Number(match[1]) : 0
}

/**
 * Adds the currently open product to the cart and waits until it is actually in
 * there.
 *
 * This used to wait for the button to relabel itself "נוסף לסל". That label is
 * a two-second `setTimeout` in ProductInfo.tsx, and the add path refreshes the
 * route, so the confirmation can be gone before an assertion sees it while the
 * add itself has plainly succeeded. Seven cart specs and the purchase-flow spec
 * failed here, always with a drawer open on screen holding the item they said
 * was never added.
 *
 * The header badge is the durable version of the same fact: it is derived from
 * cart state rather than from a timer, so it stays true for as long as the item
 * is in the cart.
 *
 * The badge ALONE was still not enough, and this is the second half of the same
 * bug. `createCartStore` is optimistic: `begin()` raises the count and sets
 * `isPending` in the same tick as the click, and `settle()` only later replaces
 * it with what the server confirmed — or rolls it back if the server refused.
 * Measured, the badge reached 1 in **2 ms** while the row took another second or
 * so to exist. A spec that navigated on the badge alone therefore asked the
 * server for `/cart` before the insert had landed and was told, correctly, that
 * the cart was empty. Seven cart specs, two checkout specs and the purchase
 * flow failed that way, and the app was never wrong.
 *
 * So this waits for the count to be up AND the button to have come back out of
 * its pending state, which is the moment `settle()` ran. The two together are
 * the server's answer rather than the browser's guess: on a refusal the button
 * re-enables too, but `settle()` has put the count back to `before`, so the
 * condition stays false and the spec fails as it should.
 */
export async function addOpenProductToCart(page: Page): Promise<void> {
  const before = await headerCartCount(page)
  const addButton = buyButton(page)
  await expect(addButton).toBeVisible()
  await expect(addButton).toBeEnabled()
  await addButton.click()
  await expect
    .poll(async () => (await addButton.isEnabled()) && (await headerCartCount(page)) > before, {
      timeout: DISCOVERY_TIMEOUT,
    })
    .toBe(true)
}
