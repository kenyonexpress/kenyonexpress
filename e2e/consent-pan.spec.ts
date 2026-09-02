import { expect, test } from '@playwright/test'

test.describe('cookie consent and PAN', () => {
  test('the consent banner is a real choice and names no card number', async ({ page }) => {
    await page.goto('/')
    const banner = page.locator('[data-consent-banner]')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Google Analytics')
    await expect(banner.getByRole('button', { name: 'לא תודה' })).toBeVisible()
    await expect(banner.getByRole('button', { name: 'אישור' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/4580|card number|מספר כרטיס מלא/i)

    await banner.getByRole('button', { name: 'לא תודה' }).click()
    await page.waitForLoadState('networkidle')
    const cookies = await page.context().cookies()
    const consent = cookies.find((c) => c.name === 'ke_consent')
    if (consent) expect(consent.value).not.toMatch(/granted/)
  })
})
