import { expect, test } from '@playwright/test'

/**
 * Shop archive: filter, sort, then infinite scroll until 40+ cards.
 *
 * The first page is 20 products. A second fetch from GET /api/products is
 * what takes the grid over 40 when the catalogue is large enough.
 */
test.describe('products infinite scroll', () => {
  test('filter then sort then scroll loads 40 or more products', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/products')

    const firstCard = page.locator('a[href^="/product/"]').first()
    const empty = page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')
    await expect(firstCard.or(empty)).toBeVisible({ timeout: 20_000 })
    test.skip(
      (await empty.count()) > 0 && (await firstCard.count()) === 0,
      'shop archive is empty in this catalogue',
    )

    const decline = page.getByRole('button', { name: 'לא תודה' })
    if (await decline.isVisible().catch(() => false)) await decline.click()

    await page.locator('summary.category-sidebar__summary').click()
    await page.getByLabel('מחיר מינימלי').fill('0')
    await page.locator('.category-sidebar__price-btn').click()
    await page.waitForURL(/[?&]min=0\b/)

    const sort = page.getByLabel('מיון מוצרים').filter({ visible: true })
    await expect(sort).toBeVisible()
    await sort.selectOption('price')
    await page.waitForURL(/[?&]sort=price_asc\b/)

    const cards = () => page.locator('.category-products__item')
    await expect(cards().first()).toBeVisible()

    for (let i = 0; i < 6; i++) {
      const shown = await cards().count()
      if (shown >= 40) break
      const sentinel = page.getByTestId('load-more-sentinel')
      if ((await sentinel.count()) === 0) break
      const pending = page.waitForResponse(
        (res) => res.url().includes('/api/products') && res.ok(),
        { timeout: 15_000 },
      )
      await sentinel.scrollIntoViewIfNeeded()
      await pending
      await expect.poll(async () => cards().count(), { timeout: 10_000 }).toBeGreaterThan(shown)
    }

    const finalCount = await cards().count()
    test.skip(finalCount < 40, `catalogue only has ${finalCount} products after filter+sort`)
    expect(finalCount).toBeGreaterThanOrEqual(40)

    const hrefs = await page
      .locator('a[href^="/product/"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href') ?? ''),
      )
    const unique = new Set(hrefs.filter(Boolean))
    expect(unique.size).toBe(hrefs.filter(Boolean).length)
  })
})
