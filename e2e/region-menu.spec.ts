import { expect, test } from '@playwright/test'

/**
 * The masthead region menu -- live's `secondary-nav`, rebuilt in D19.
 *
 * WHY THIS IS AN E2E AND NOT A UNIT TEST. The bug it exists to prevent is
 * invisible in the source and invisible to a render test: the first version
 * kept ONE `open` boolean that hover set and the trigger's click toggled, so on
 * any pointer device moving to the trigger opened it and the click that
 * followed shut it again. A tap does both in one gesture, which made the menu
 * literally unopenable on a touch device. Reading the component does not show
 * that; driving a real browser does, which is how it was found.
 *
 * The menu is `lg`-and-up only, matching live, so every test here uses a
 * desktop viewport. The handheld path is MobileDrawer's and is covered
 * elsewhere.
 */

const TRIGGER = 'בחר אזור'
const DESKTOP = { width: 1440, height: 1000 }

test.describe('the region menu', () => {
  test.use({ viewport: DESKTOP })

  test('opens on click and lists all seventeen regions', async ({ page }) => {
    await page.goto('/')
    const trigger = page.getByRole('button', { name: TRIGGER })
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await trigger.click()

    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('a[data-region-item]')).toHaveCount(17)
  })

  test('opens on tap, which a hover-plus-toggle menu cannot do', async ({ browser }) => {
    // The regression this file is named for. `hasTouch` makes the tap real.
    const context = await browser.newContext({ viewport: DESKTOP, hasTouch: true })
    const page = await context.newPage()
    await page.goto('/')

    const trigger = page.getByRole('button', { name: TRIGGER })
    await trigger.tap()

    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('a[data-region-item]')).toHaveCount(17)
    await context.close()
  })

  test('closes on Escape and gives focus back to the trigger', async ({ page }) => {
    await page.goto('/')
    const trigger = page.getByRole('button', { name: TRIGGER })
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await page.keyboard.press('Escape')

    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // Without this half a keyboard user is dropped at the top of the document.
    await expect(trigger).toBeFocused()
  })

  test('walks the regions with the arrow keys and wraps at both ends', async ({ page }) => {
    await page.goto('/')
    const trigger = page.getByRole('button', { name: TRIGGER })
    await trigger.focus()

    await page.keyboard.press('ArrowDown')
    await expect(page.locator('a[data-region-item]').first()).toBeFocused()

    await page.keyboard.press('ArrowUp')
    // Up from the first item wraps to the last, which is אילת.
    await expect(page.locator('a[data-region-item]').last()).toBeFocused()
  })

  test('navigates to a region page that resolves', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: TRIGGER }).click()
    await page.locator('a[data-region-item]').last().click()

    await expect(page).toHaveURL(/\/city\//)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('אילת')
  })

  test('every one of the seventeen links resolves, none 404s', async ({ page, request }) => {
    await page.goto('/')
    await page.getByRole('button', { name: TRIGGER }).click()

    const hrefs = await page
      .locator('a[data-region-item]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href') ?? ''))
    expect(hrefs).toHaveLength(17)

    // The whole point of building /city/[slug] in the same step as the menu:
    // a dropdown whose every item 404s is worse than the flat link it replaced.
    for (const href of hrefs) {
      const response = await request.get(href)
      expect(response.status(), `${decodeURIComponent(href)} should not 404`).toBe(200)
    }
  })
})
