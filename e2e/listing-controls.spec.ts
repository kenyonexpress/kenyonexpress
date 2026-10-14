import { expect, test } from '@playwright/test'

/**
 * UX14 (14.10.2026): THE LISTING PAGE'S CONTROLS, read off the built page.
 * Measured before (logs/ux14/before.json): the view switcher was four
 * `aria-hidden` spans that did nothing, the sort select offered popularity
 * and rating (both fell through to the default order), an active filter was
 * visible nowhere outside the closed sidebar, and the pagination numbers had
 * no "page" label.
 *
 * Now: two real buttons that switch the grid into rows and remember the
 * choice, four sort options that each reorder, a strip of removable chips
 * when a facet is on, a price form that refuses an inverted range on the
 * page, and live's labelled `<ul>` pagination.
 */

type Page = import('@playwright/test').Page

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

const SETTLED = '.category-page__count:not(.category-page__count--pending), .category-page__empty'

test.describe('listing controls (UX14)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
  })

  test('the view switcher lays the grid out as rows and remembers it', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the switcher is desktop-only, as on live')
    await page.goto('/products')
    await expect(page.locator(SETTLED).first()).toBeVisible({ timeout: 15_000 })

    const group = page.getByRole('group', { name: 'תצוגת המוצרים' })
    await expect(group).toBeVisible()
    const grid = group.getByRole('button', { name: 'תצוגת רשת' })
    const list = group.getByRole('button', { name: 'תצוגת רשימה' })
    await expect(grid).toHaveAttribute('aria-pressed', 'true')
    await expect(list).toHaveAttribute('aria-pressed', 'false')

    const items = page.locator('.category-products__item')
    const before = await items.nth(1).boundingBox()
    await list.click()
    await expect(list).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.category-page__body')).toHaveAttribute('data-view', 'list')
    await expect(page.locator('.category-card--list').first()).toBeVisible()

    // A row is the full container; in the grid the second card sat beside the first.
    const container = await page.locator('.category-page__inner').boundingBox()
    const after = await items.nth(1).boundingBox()
    expect(after?.width ?? 0).toBeGreaterThan((container?.width ?? 0) * 0.95)
    expect(after?.width ?? 0).toBeGreaterThan(before?.width ?? 0)

    await page.reload()
    await expect(page.locator(SETTLED).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'תצוגת רשימה' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('.category-page__body')).toHaveAttribute('data-view', 'list')
  })

  test('the sort select offers only orders the catalogue honours', async ({ page }) => {
    await page.goto('/products')
    const select = page.getByLabel('מיון מוצרים')
    await expect(select).toBeVisible()
    const values = await select
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
    expect(values).toEqual(['menu_order', 'date', 'price', 'price-desc'])
  })

  test('an active filter is a removable chip, and two of them get a clear-all link', async ({
    page,
  }) => {
    await page.goto('/products?type=coupon&min=50')
    const strip = page.getByRole('navigation', { name: 'סינונים פעילים' })
    await expect(strip).toBeVisible()
    await expect(strip.getByRole('link', { name: 'הסרת הסינון סוג: קופונים' })).toHaveAttribute(
      'href',
      '/products?min=50',
    )
    await expect(strip.getByRole('link', { name: 'נקה הכל' })).toHaveAttribute('href', '/products')

    // The closed sidebar says how many facets are on, before it is opened.
    await expect(page.locator('.category-sidebar__summary')).toContainText('(2)')

    await strip.getByRole('link', { name: 'הסרת הסינון סוג: קופונים' }).click()
    await page.waitForURL(/\/products\?min=50$/)
    await expect(strip.getByRole('link', { name: /הסרת הסינון מחיר/ })).toBeVisible()
    await expect(strip.getByRole('link', { name: 'נקה הכל' })).toHaveCount(0)
  })

  test('the price form refuses an inverted range on the page, without a request', async ({
    page,
  }) => {
    await page.goto('/products')
    await page.locator('.category-sidebar__summary').click()
    await page.getByLabel('מחיר מינימלי').fill('200')
    await page.getByLabel('מחיר מקסימלי').fill('50')
    await page.locator('.category-sidebar__price-btn').click()
    const alert = page.locator('.category-sidebar [role="alert"]')
    await expect(alert).toHaveText('המחיר המינימלי גבוה מהמקסימלי')
    await expect(page.getByLabel('מחיר מינימלי')).toHaveAttribute('aria-invalid', 'true')
    expect(new URL(page.url()).search).toBe('')

    // Fixing the field clears the sentence, and a valid range navigates.
    await page.getByLabel('מחיר מקסימלי').fill('500')
    await expect(alert).toHaveCount(0)
    await page.locator('.category-sidebar__price-btn').click()
    await page.waitForURL(/[?&]min=200&max=500/)
  })

  test('pagination is a list of labelled pages', async ({ page }) => {
    await page.goto('/products')
    await expect(page.locator(SETTLED).first()).toBeVisible({ timeout: 15_000 })
    const nav = page.getByRole('navigation', { name: 'ניווט בין עמודים' })
    test.skip((await nav.count()) === 0, 'the archive fits on one page')
    await expect(nav.locator('ul.category-pagination__list > li').first()).toBeAttached()
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('aria-label', 'עמוד 1')
    await expect(nav.getByRole('link', { name: 'עמוד 2' })).toHaveAttribute(
      'href',
      '/products?page=2',
    )
  })
})
