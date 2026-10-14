import { expect, test } from '@playwright/test'

/**
 * UX22: the archive's paging switch on a built server. The server renders
 * the numbered pages; the switch under them chooses continuous loading,
 * which hides the links, appends the next page inside the same grid as the
 * shopper reaches its foot, survives a reload, and gives the links back.
 *
 * `/products` is the archive with a second page in this catalogue (46
 * active products, 24 a page). A category with one page is asserted to
 * carry no switch at all: there is nothing to choose between.
 */

const PAGING_KEY = 'ke_catalog_paging_v1'

async function settledGrid(page: import('@playwright/test').Page) {
  const grid = page.locator('ul.category-products:not([aria-busy="true"])')
  await expect(grid.locator('li').first()).toBeVisible({ timeout: 30_000 })
  return grid
}

test.describe('archive paging switch (UX22)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('ke_consent', 'denied.2')
    })
    await context.addCookies([
      { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' },
    ])
  })

  test('the next page is served as JSON with the archive cache policy', async ({ request }) => {
    const res = await request.get('/api/catalog/page?page=2')
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toContain('s-maxage=60')
    const body = (await res.json()) as { items: unknown[]; total: number; totalPages: number }
    test.skip(body.totalPages < 2, 'the shop archive has one page in this catalogue')
    expect(body.items.length).toBeGreaterThan(0)
    expect(body.total).toBeGreaterThan(24)
  })

  test('continuous loading appends the next page inside the grid and survives a reload', async ({
    page,
  }) => {
    await page.goto('/products')
    const grid = await settledGrid(page)
    const pagination = page.locator('nav.category-pagination')
    test.skip(!(await pagination.count()), 'the shop archive has one page in this catalogue')

    // The HTML is the numbered mode: real links, the switch saying so.
    await expect(pagination.getByRole('link', { name: 'עמוד 2' })).toBeVisible()
    const group = page.getByRole('group', { name: 'אופן הדפדוף' })
    await expect(group.getByRole('button', { name: 'עמודים' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const firstPage = await grid.locator('li').count()
    expect(firstPage).toBe(24)

    await group.getByRole('button', { name: 'גלילה רציפה' }).click()
    await expect(pagination).toHaveCount(0)
    // The foot carries the continuous control now, and the observer presses
    // its button the moment it is within a screen of the viewport. The switch
    // sits right under it, so after the click above it already is: page two
    // lands with no further gesture, inside the SAME list.
    await expect(page.locator('.category-load-more')).toHaveCount(1)
    expect(await page.evaluate((key) => window.localStorage.getItem(key), PAGING_KEY)).toBe(
      'scroll',
    )
    await expect(grid.locator('li')).toHaveCount(46, { timeout: 15_000 })
    await expect(page.locator('ul.category-products')).toHaveCount(1)
    await expect(grid.locator('li[data-loaded-page="2"]').first()).toBeVisible()
    await expect(page.locator('.category-page__count--bottom')).toHaveText(/מציגים את כל/)
    // The last page is in: no button, and the live region said what landed.
    await expect(page.getByRole('button', { name: 'טעינת עוד מוצרים' })).toHaveCount(0)
    await expect(page.locator('.category-load-more output')).toContainText('נטענו 22 מוצרים נוספים')

    // The preference survives a reload: no links, the button is back, and the
    // depth reached in this session is refilled before the shopper scrolls.
    await page.reload()
    await settledGrid(page)
    await expect(page.locator('nav.category-pagination')).toHaveCount(0)
    await expect(group.getByRole('button', { name: 'גלילה רציפה' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('ul.category-products li')).toHaveCount(46, { timeout: 15_000 })

    // Numbered pages again: this page's cards alone, the links back.
    await group.getByRole('button', { name: 'עמודים' }).click()
    await expect(page.locator('ul.category-products li')).toHaveCount(24)
    await expect(page.locator('nav.category-pagination')).toBeVisible()
    expect(await page.evaluate((key) => window.localStorage.getItem(key), PAGING_KEY)).toBeNull()
  })

  test('a one-page archive offers no switch', async ({ page }) => {
    await page.goto('/category/beauty-health')
    await settledGrid(page)
    const cards = await page.locator('ul.category-products li').count()
    test.skip(cards > 24, 'this category grew past one page')
    await expect(page.getByRole('group', { name: 'אופן הדפדוף' })).toHaveCount(0)
    await expect(page.locator('nav.category-pagination')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'נתיב ניווט' })).toBeVisible()
  })
})
