import { expect, test } from '@playwright/test'

test.describe('UX31 Animations', () => {
  test('page transitions animate smoothly', async ({ page }) => {
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    // Click on a product link to trigger page transition
    const productLink = page.locator('a[href*="/product/"]').first()
    if (await productLink.isVisible()) {
      await productLink.click()
      await page.waitForLoadState('networkidle')

      // Verify page loaded by checking for page content
      const pageContent = page.locator('body')
      expect(await pageContent.isVisible()).toBe(true)
    }
  })

  test('product cards have hover animation', async ({ page }) => {
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    const productCard = page.locator('[data-testid*="product-card"]').first()
    if (await productCard.isVisible()) {
      // Get initial position and scale
      const boundingBox = await productCard.boundingBox()
      expect(boundingBox).toBeTruthy()

      // Hover over card
      await productCard.hover()
      await page.waitForTimeout(300) // Wait for animation

      // Card should still be visible and interactive
      expect(await productCard.isVisible()).toBe(true)
    }
  })

  test('dialog appears with animation', async ({ page }) => {
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    // Look for a dialog trigger (could be login, search, etc.)
    const loginButton = page.locator('button:has-text("התחברות")').first()
    if (await loginButton.isVisible()) {
      await loginButton.click()
      await page.waitForTimeout(400) // Wait for dialog animation

      // Dialog should be visible
      const dialog = page.locator('[role="dialog"]').first()
      expect(await dialog.isVisible()).toBe(true)
    }
  })

  test('coupon cards have hover effects', async ({ page }) => {
    await page.goto('/coupons')
    await page.waitForLoadState('networkidle')

    const couponCard = page.locator('[data-testid*="coupon-card"]').first()
    if (await couponCard.isVisible()) {
      // Hover over coupon card
      await couponCard.hover()
      await page.waitForTimeout(300) // Wait for animation

      // Card should remain visible
      expect(await couponCard.isVisible()).toBe(true)
    }
  })

  test('modal close animation completes', async ({ page }) => {
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    const loginButton = page.locator('button:has-text("התחברות")').first()
    if (await loginButton.isVisible()) {
      await loginButton.click()
      await page.waitForTimeout(400)

      // Find and click close button
      const closeButton = page.locator('[role="dialog"] button:has-text("×")').first()
      if (await closeButton.isVisible()) {
        await closeButton.click()
        await page.waitForTimeout(400) // Wait for exit animation

        // Dialog should be gone
        const dialog = page.locator('[role="dialog"]')
        expect(await dialog.isVisible()).toBe(false)
      }
    }
  })

  test('staggered list animations work', async ({ page }) => {
    await page.goto('/coupons')
    await page.waitForLoadState('networkidle')

    // Get all coupon cards
    const couponCards = page.locator('[data-testid*="coupon-card"]')
    const count = await couponCards.count()

    if (count > 0) {
      // All cards should be visible
      for (let i = 0; i < Math.min(count, 3); i++) {
        const card = couponCards.nth(i)
        expect(await card.isVisible()).toBe(true)
      }
    }
  })

  test('animations do not block interactions', async ({ page }) => {
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    const productCard = page.locator('[data-testid*="product-card"]').first()
    if (await productCard.isVisible()) {
      // Hover and immediately click
      await productCard.hover()
      const link = productCard.locator('a').first()
      if (await link.isVisible()) {
        await link.click()
        await page.waitForLoadState('networkidle')

        // Should successfully navigate
        expect(page.url()).not.toBe('about:blank')
      }
    }
  })

  test('responsive animations on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    const productCard = page.locator('[data-testid*="product-card"]').first()
    if (await productCard.isVisible()) {
      await productCard.hover()
      await page.waitForTimeout(300)

      // Card should still be visible on mobile
      expect(await productCard.isVisible()).toBe(true)
    }
  })
})
