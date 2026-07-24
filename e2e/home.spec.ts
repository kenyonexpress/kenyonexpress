import { expect, test } from '@playwright/test'

test.describe('homepage', () => {
  test('loads with RTL layout and the Hebrew locale', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/KenyonExpress/)
    const html = page.locator('html')
    await expect(html).toHaveAttribute('dir', 'rtl')
    await expect(html).toHaveAttribute('lang', 'he')
  })

  test('renders product links with add-to-cart buttons', async ({ page }) => {
    await page.goto('/')

    const productLink = page.locator('a[href^="/product/"]').first()
    await expect(productLink).toBeVisible({ timeout: 15000 })

    // Deal cards expose add-to-cart via Hebrew aria-label (revealed on hover,
    // so assert presence rather than visibility)
    await expect(page.getByRole('button', { name: /הוסף .* לעגלה/ }).first()).toBeAttached()
  })

  test('offers category navigation into the archives', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('a[href^="/category/"]').first()).toBeAttached({ timeout: 15000 })
  })

  test('shows a cart control in the header before anything is added', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /עגלת קניות/ }).first()).toBeVisible()
  })

  test('search results page finds products', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent('צימר')}`)
    await expect(page.getByRole('heading', { name: /תוצאות חיפוש/ })).toBeVisible()
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible()
  })

  test('short query shows the minimum-characters hint', async ({ page }) => {
    await page.goto('/search?q=a')
    await expect(page.getByText('הקלידו לפחות 2 תווים כדי לחפש')).toBeVisible()
  })

  test('a search term with SQL wildcards is treated as text, not a pattern', async ({ page }) => {
    // Guards the LIKE/PostgREST escaping fix (commit 876aae0): these must not
    // error the request or silently match everything.
    for (const term of ['%%', '100%_x', 'a,b']) {
      const response = await page.goto(`/search?q=${encodeURIComponent(term)}`)
      expect(response?.status(), term).toBe(200)
      await expect(page.getByRole('heading', { name: /תוצאות חיפוש/ })).toBeVisible()
    }
  })
})
