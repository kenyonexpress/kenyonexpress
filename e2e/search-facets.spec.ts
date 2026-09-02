import { expect, test } from '@playwright/test'

test.describe('search facets', () => {
  test('category, price, supplier and discount are on the search sidebar', async ({ page }) => {
    await page.goto('/search?q=%D7%91%D7%93%D7%99%D7%A7%D7%95%D7%AA')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

    const disclosure = page.getByText('סינון מוצרים')
    await expect(disclosure).toBeVisible()
    await disclosure.click()

    await expect(page.getByRole('heading', { name: 'קטגוריות' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'סינון לפי מחיר' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'ספק' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'הנחה' })).toBeVisible()

    await page.getByRole('button', { name: 'רק דילים בהנחה' }).click()
    await expect(page).toHaveURL(/discount=1/)

    await page.getByLabel('מחיר מינימלי').fill('10')
    await page.getByLabel('מחיר מקסימלי').fill('500')
    await page.getByRole('button', { name: 'סינון', exact: true }).click()
    await expect(page).toHaveURL(/min=10/)
    await expect(page).toHaveURL(/max=500/)

    const supplier = page.getByRole('button', { name: 'ספק בדיקות אוטומטיות' })
    if (await supplier.isVisible().catch(() => false)) {
      await supplier.click()
      await expect(page).toHaveURL(/supplier=/)
    }

    const category = page.getByRole('link', { name: 'קטגוריית בדיקות' })
    if (await category.isVisible().catch(() => false)) {
      await category.click()
      await expect(page).toHaveURL(/\/category\/e2e-test-category/)
    }
  })
})
