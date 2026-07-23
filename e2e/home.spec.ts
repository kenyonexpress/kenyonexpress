import { expect, test } from '@playwright/test'

test.describe('homepage', () => {
  test('renders product links with add-to-cart buttons', async ({ page }) => {
    await page.goto('/')

    const productLink = page.locator('a[href^="/product/"]').first()
    await expect(productLink).toBeVisible({ timeout: 15000 })

    // Deal cards expose add-to-cart via Hebrew aria-label (revealed on hover,
    // so assert presence rather than visibility)
    await expect(page.getByRole('button', { name: /הוסף .* לעגלה/ }).first()).toBeAttached()
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
})
