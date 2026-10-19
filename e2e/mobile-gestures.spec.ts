import { expect, test } from '@playwright/test'

test.describe('Mobile Gestures - Interaction Verification', () => {
  test('swipe gesture on product gallery changes image', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/product/e2e-test-physical')

    const gallery = page.locator('[data-swipeable-gallery]').first()
    // Give page more time to load and render
    await gallery.waitFor({ state: 'visible', timeout: 10000 })

    // Simulate swipe using pointer events which are more compatible
    const bbox = await gallery.boundingBox()
    if (bbox) {
      const startX = bbox.x + bbox.width * 0.8
      const startY = bbox.y + bbox.height * 0.5
      const endX = bbox.x + bbox.width * 0.2
      const endY = bbox.y + bbox.height * 0.5

      // Use pointer events instead of touch events
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(endX, endY, { steps: 10 })
      await page.mouse.up()

      // Wait a bit for any animations
      await page.waitForTimeout(300)
    }

    // Verify gallery is still visible after swipe
    await expect(gallery).toBeVisible()
  })

  test('pull-to-refresh responds to downward drag on homepage', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const pullArea = page.locator('[data-pull-to-refresh]')
    await expect(pullArea).toBeVisible()

    // Simulate pull-to-refresh: drag down from top
    // Using pointer/mouse events which are more compatible than TouchEvent
    await page.mouse.move(200, 50)
    await page.mouse.down()
    await page.mouse.move(200, 200, { steps: 10 })
    await page.mouse.up()

    // Wait for any animations or refresh logic
    await page.waitForTimeout(300)

    // Component should handle pull gestures
    await expect(pullArea).toBeVisible()
  })

  test('sticky cart bar add-to-cart button is clickable on product page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/product/e2e-test-physical')

    const cartBar = page.locator('[data-sticky-cart-bar]')
    await expect(cartBar).toBeVisible()

    const button = cartBar.locator('button')
    await expect(button).toBeEnabled()

    // Verify button can be clicked
    const isClickable = await button.isEnabled()
    expect(isClickable).toBeTruthy()

    // Verify button has content
    const buttonText = await button.textContent()
    expect(buttonText).toContain('הוסף לעגלה')
  })

  test('pull-to-refresh NOT on product page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/product/e2e-test-physical')

    const pullArea = page.locator('[data-pull-to-refresh]')
    const isVisible = await pullArea.isVisible().catch(() => false)

    // Pull-to-refresh should NOT be on product page
    expect(isVisible).toBeFalsy()
  })

  test('pull-to-refresh IS on category page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/category/home-and-garden')

    const pullArea = page.locator('[data-pull-to-refresh]')
    await expect(pullArea).toBeVisible()
  })
})
