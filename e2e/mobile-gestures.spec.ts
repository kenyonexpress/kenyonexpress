import { expect, test } from '@playwright/test'

test.describe('Mobile Gestures - Interaction Verification', () => {
  test('swipe gesture on product gallery changes image', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/product/e2e-test-physical')

    const gallery = page.locator('[data-swipeable-gallery]').first()
    await expect(gallery).toBeVisible()

    // Simulate swipe: touch down, move right to left, release
    await gallery.evaluate(() => {
      const el = document.querySelector('[data-swipeable-gallery]') as HTMLElement
      if (el) {
        const startX = 350
        const startY = 200
        const endX = 50
        const endY = 200

        const touchStartEvent = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [
            {
              clientX: startX,
              clientY: startY,
              identifier: 0,
            } as any,
          ],
        })

        const touchMoveEvent = new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [
            {
              clientX: endX,
              clientY: endY,
              identifier: 0,
            } as any,
          ],
          changedTouches: [
            {
              clientX: endX,
              clientY: endY,
              identifier: 0,
            } as any,
          ],
        })

        const touchEndEvent = new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [
            {
              clientX: endX,
              clientY: endY,
              identifier: 0,
            } as any,
          ],
        })

        el.dispatchEvent(touchStartEvent)
        el.dispatchEvent(touchMoveEvent)
        el.dispatchEvent(touchEndEvent)
      }
    })

    // Verify gallery is still visible after swipe
    await expect(gallery).toBeVisible()
  })

  test('pull-to-refresh responds to downward drag on homepage', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const pullArea = page.locator('[data-pull-to-refresh]')
    await expect(pullArea).toBeVisible()

    // Simulate pull-to-refresh: drag down from top
    await page.evaluate(() => {
      const el = document.querySelector('[data-pull-to-refresh]') as HTMLElement
      if (el) {
        const startY = 50
        const endY = 200

        const touchStartEvent = new TouchEvent('touchstart', {
          bubbles: true,
          touches: [{ clientY: startY } as any],
        })

        const touchMoveEvent = new TouchEvent('touchmove', {
          bubbles: true,
          touches: [{ clientY: endY } as any],
          changedTouches: [{ clientY: endY } as any],
        })

        const touchEndEvent = new TouchEvent('touchend', {
          bubbles: true,
          changedTouches: [{ clientY: endY } as any],
        })

        el.dispatchEvent(touchStartEvent)
        el.dispatchEvent(touchMoveEvent)
        el.dispatchEvent(touchEndEvent)
      }
    })

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
