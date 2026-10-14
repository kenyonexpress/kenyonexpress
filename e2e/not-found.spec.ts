import { expect, test } from '@playwright/test'

/**
 * UX25: the 404 on a built server. Before (logs/ux25/before.json) an unmatched
 * URL had no header, no footer and no search field, and a dead product slug
 * rendered the 404's own <main> inside the shell's. Now both cases paint the
 * storefront chrome exactly once, with the site search field, six category
 * tiles and the home link in the body.
 */

const DEAD = ['/this-page-does-not-exist-ux25', '/product/no-such-product-slug-12345'] as const

test.describe('404 page (UX25)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' },
    ])
  })

  for (const path of DEAD) {
    test(`${path} is a 404 with the chrome once, the search field, the tiles and the home link`, async ({
      page,
      request,
    }) => {
      const raw = await request.get(path)
      expect(raw.status()).toBe(404)
      expect(await raw.text()).toContain('<meta name="robots" content="noindex"/>')

      const response = await page.goto(path)
      expect(response?.status()).toBe(404)
      await expect(page.getByRole('heading', { name: 'הדף שחיפשתם לא נמצא' })).toBeVisible()

      // One shell: one header, one footer, one main landmark.
      await expect(page.locator('header')).toHaveCount(1)
      await expect(page.locator('footer')).toHaveCount(1)
      await expect(page.locator('main')).toHaveCount(1)
      await expect(page.locator('main [data-not-found]')).toHaveAttribute('dir', 'rtl')

      const field = page.locator('#not-found-search')
      await expect(field).toBeVisible()
      await expect(field).toHaveAttribute('role', 'combobox')

      const tiles = page.locator('[data-not-found-categories] a[href^="/category/"]')
      await expect(tiles).toHaveCount(6)
      const nav = page.getByRole('navigation', { name: 'דרכים להמשיך' })
      await expect(nav.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
      for (const link of await nav.getByRole('link').all()) {
        const box = await link.boundingBox()
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      }
    })
  }

  test('the field searches: Enter on a typed query opens the results page for it', async ({
    page,
  }) => {
    await page.goto(DEAD[0])
    const field = page.locator('#not-found-search')
    await field.fill('מתנה')
    await field.press('Enter')
    await expect(page).toHaveURL(/\/search\?q=/)
    expect(decodeURIComponent(new URL(page.url()).search)).toContain('מתנה')
  })

  test('a category tile on the 404 opens that category', async ({ page }) => {
    await page.goto(DEAD[0])
    const first = page.locator('[data-not-found-categories] a[href^="/category/"]').first()
    const href = await first.getAttribute('href')
    await first.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
