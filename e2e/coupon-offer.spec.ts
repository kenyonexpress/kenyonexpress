import { type Page, expect, test } from '@playwright/test'

const DISCOVERY_TIMEOUT = 15_000

/**
 * `/coupon/[slug]`: the coupon variant of a product page, public.
 *
 * The slug is discovered from the archive's coupon filter rather than pinned,
 * because the catalogue is data. The voucher half of the same prefix is
 * covered by coupon-scan.spec.ts (a UUID redirects to login).
 */
async function firstCouponSlug(page: Page): Promise<string | null> {
  await page.goto('/products?type=coupon')
  const link = page.locator('a[href^="/product/"]').first()
  if ((await link.count()) === 0) return null
  await expect(link).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
  const href = await link.getAttribute('href')
  return href ? href.replace(/^\/product\//, '') : null
}

test.describe('coupon variant', () => {
  test('renders the masked code, the terms accordion, the merchant section and no voucher QR', async ({
    page,
  }) => {
    const slug = await firstCouponSlug(page)
    test.skip(slug === null, 'no coupon product in this catalogue')

    const response = await page.goto(`/coupon/${slug}`)
    expect(response?.status()).toBe(200)
    expect(new URL(page.url()).pathname).toBe(`/coupon/${slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('[data-cpn="page"]')).toHaveAttribute('data-cpn', 'page')

    const mask = page.getByTestId('coupon-code-mask')
    await expect(mask).toBeVisible()
    await expect(mask).toHaveText('•••••-•••••')
    // Nothing on the public page carries a redeem URL.
    expect(await page.locator('img[src^="data:image"]').count()).toBeLessThanOrEqual(1)
    await expect(page.locator('a[href*="/redeem/"]')).toHaveCount(0)

    const terms = page.locator('[data-cpn="terms"] details')
    expect(await terms.count()).toBeGreaterThan(0)
    await expect(terms.first()).toHaveAttribute('open', '')
    const last = terms.last()
    await last.locator('summary').click()
    await expect(last).toHaveAttribute('open', '')

    await expect(page.locator('[data-cpn="map"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'איפה מממשים' })).toBeVisible()

    // The buy column is the product page's own.
    await expect(
      page.getByRole('button', { name: /הוסף לסל|קנה עכשיו|אזל מהמלאי|לא זמין לרכישה/ }).first(),
    ).toBeVisible()
  })

  test('similar coupons link to coupon pages and the product page links back', async ({ page }) => {
    const slug = await firstCouponSlug(page)
    test.skip(slug === null, 'no coupon product in this catalogue')

    await page.goto(`/coupon/${slug}`)
    const similar = page.locator('[data-cpn="similar"] a[href^="/coupon/"]')
    if ((await similar.count()) > 0) {
      await expect(similar.first()).toHaveAttribute('href', /^\/coupon\//)
    }

    await page.goto(`/product/${slug}`)
    const back = page.locator(`a[href="/coupon/${slug}"]`)
    await expect(back.first()).toBeVisible()
  })

  test('a physical product has no coupon variant and lands on its product page', async ({
    page,
  }) => {
    await page.goto('/products?type=physical')
    const link = page.locator('a[href^="/product/"]').first()
    test.skip((await link.count()) === 0, 'no physical product in this catalogue')
    const slug = (await link.getAttribute('href'))?.replace(/^\/product\//, '') ?? ''

    await page.goto(`/coupon/${slug}`)
    await expect(page).toHaveURL(
      new RegExp(`/product/${slug.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`),
    )
  })

  test('an unknown slug is a real 404 and a UUID still needs a session', async ({ page }) => {
    const missing = await page.goto('/coupon/no-such-coupon-slug-xyz')
    expect(missing?.status()).toBe(404)

    await page.goto('/coupon/00000000-0000-4000-8000-000000000000')
    await expect(page).toHaveURL(/\/login/)
  })
})
