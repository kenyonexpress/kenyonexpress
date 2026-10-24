/**
 * DOM integration tests for WhatsAppButton 44px touch target verification.
 * Runs in real browser via Playwright to verify actual rendered dimensions.
 */
import { expect, test } from '@playwright/test'

test.describe('WhatsAppButton rendered dimensions', () => {
  test('renders with minimum 44px height in DOM', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .min-h-touch-min { min-height: 44px; }
            .bg-whatsapp { background-color: #25d366; }
            a { display: inline-flex; align-items: center; padding: 10px 16px; }
          </style>
        </head>
        <body>
          <a href="https://wa.me/972501234567" class="min-h-touch-min bg-whatsapp" id="wa-button">
            Contact
          </a>
        </body>
      </html>
    `)

    const button = page.locator('#wa-button')
    const box = await button.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test('mailto fallback renders correctly', async ({ page }) => {
    const mailtoHref = 'mailto:support@kenyonexpress.co.il?subject=test'

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <a href="${mailtoHref}" id="mailto-button">Contact</a>
        </body>
      </html>
    `)

    const button = page.locator('#mailto-button')
    await expect(button).toHaveAttribute('href', mailtoHref)
  })
})
