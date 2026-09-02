import { expect, test } from '@playwright/test'
import { expectHebrewRtl } from './helpers'

/**
 * Hebrew UI integrity snapshots. Pixel PNGs are not committed: first-run
 * toHaveScreenshot fails CI, and existing e2e/rtl-mobile.spec.ts already
 * pins dir=rtl lang=he. This file snapshots the document root attributes
 * and computed direction so a flipped shell cannot pass.
 */
test.describe('RTL Hebrew snapshots', () => {
  for (const path of [
    '/',
    '/accessibility',
    '/terms-and-conditions',
    '/privacy-policy',
    '/refund_returns',
    '/login',
  ]) {
    test(`${path} snapshot stays rtl`, async ({ page }) => {
      await page.goto(path)
      await expectHebrewRtl(page)
      const snapshot = await page.locator('html').evaluate((el) => ({
        dir: el.getAttribute('dir'),
        lang: el.getAttribute('lang'),
        direction: getComputedStyle(el).direction,
      }))
      expect(snapshot).toEqual({ dir: 'rtl', lang: 'he', direction: 'rtl' })
      await expect(page.locator('body')).not.toHaveCSS('direction', 'ltr')
    })
  }
})
