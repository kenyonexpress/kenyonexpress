import { expect, test } from '@playwright/test'
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  adminTestsEnabled,
  signInWithEmail,
} from './auth-session'
import { expectHebrewRtl } from './helpers'

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * C111: the image upload on the admin product form. Non-destructive: the file
 * is staged in the browser and the Hebrew-alt rule is checked, but nothing is
 * uploaded and no product is created (the product-write refusals are in
 * admin-product-crud.spec.ts).
 */
test.describe('admin product upload @admin', () => {
  test.describe.configure({ timeout: 90_000 })

  test('a staged image shows a preview and asks for Hebrew alt text', async ({ page }) => {
    test.skip(!adminTestsEnabled(), 'E2E_ADMIN_PASSWORD not configured')
    await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products/new')
    await page.goto('/admin/products/new')
    const title = page.getByRole('heading', { name: 'מוצר חדש' })
    test.skip(!(await title.isVisible().catch(() => false)), 'admin fixture is not seeded')
    await expectHebrewRtl(page)

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'c111.png',
      mimeType: 'image/png',
      buffer: PNG,
    })
    await expect(page.getByLabel('טקסט חלופי עבור c111.png')).toBeVisible()
    await expect(page.getByRole('button', { name: 'הסרת c111.png' })).toBeVisible()
  })
})
