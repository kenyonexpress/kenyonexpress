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

export async function openFirstProduct(page: Page): Promise<void> {
  await page.goto('/products')
  const link = page.locator('a[href^="/product/"]').first()
  await expect(link).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
  await link.click()
  await page.waitForURL(/\/product\//)
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
  for (let i = 0; i < count; i += 1) {
    const href = await links.nth(i).getAttribute('href')
    const slug = href?.split('?')[0]?.replace('/category/', '')
    if (slug) return slug
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

/** Adds the currently open product to the cart and waits for the confirmation. */
export async function addOpenProductToCart(page: Page): Promise<void> {
  // .first(): related-product cards carry their own add-to-cart buttons
  const addButton = page.getByRole('button', { name: BUY_BUTTON }).first()
  await expect(addButton).toBeVisible()
  await addButton.click()
  await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()
}
