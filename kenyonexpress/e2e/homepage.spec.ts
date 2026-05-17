import { expect, test } from '@playwright/test'

test('homepage loads with RTL layout', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/KenyonExpress/)
  const html = page.locator('html')
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(html).toHaveAttribute('lang', 'he')
})
