import { expect, test } from '@playwright/test'

test.describe('checkout gate', () => {
  test('anonymous direct visit to /checkout is sent to login with a return path', async ({
    page,
  }) => {
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/, { timeout: 15000 })
  })
})
