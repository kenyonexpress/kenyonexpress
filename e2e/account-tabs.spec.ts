import { type Cookie, expect, test } from '@playwright/test'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'

/**
 * UX18: the account's top tabs (overview, orders, wishlist, addresses,
 * settings), in Hebrew, on a built server, as the seeded customer.
 *
 * One password login per project, copied into each test's context as
 * cookies: the login limiter is 10 per hour per client IP, and a login per
 * test across two projects would spend most of it on one run.
 */
const TABS = ['סקירה', 'ההזמנות שלי', 'רשימת המשאלות', 'כתובות', 'הגדרות']

test.describe('account tabs (UX18)', () => {
  test.skip(!paidFlowEnabled(), 'E2E customer fixture is disabled (E2E_PAID_FLOW=0)')

  let session: Cookie[] = []

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account')
    session = (await page.context().storageState()).cookies
    await page.close()
  })

  test.beforeEach(async ({ context }) => {
    await context.addCookies(session)
  })

  test('the shell carries the five tabs in Hebrew and the overview is current', async ({
    page,
  }) => {
    await page.goto('/account')
    const bar = page.getByRole('navigation', { name: 'אזורי החשבון' })
    await expect(bar).toBeVisible()
    const links = bar.getByRole('link')
    await expect(links).toHaveText(TABS)
    await expect(bar.getByRole('link', { name: 'סקירה' })).toHaveAttribute('aria-current', 'page')
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(1)
    // Route-based tabs: links, not an ARIA tablist.
    await expect(bar.getByRole('tab')).toHaveCount(0)
    // The overview itself renders (it used to throw on the coupons tile).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('האזור האישי')
  })

  test('each tab opens its page inside the shell and becomes current', async ({ page }) => {
    await page.goto('/account')
    const bar = page.getByRole('navigation', { name: 'אזורי החשבון' })

    await bar.getByRole('link', { name: 'ההזמנות שלי' }).click()
    await expect(page).toHaveURL(/\/account\/orders$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ההזמנות שלי')
    await expect(bar.getByRole('link', { name: 'ההזמנות שלי' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await bar.getByRole('link', { name: 'רשימת המשאלות' }).click()
    await expect(page).toHaveURL(/\/account\/wishlist$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('רשימת המשאלות')
    await expect(bar.getByRole('link', { name: 'רשימת המשאלות' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // Still inside the account shell: the side nav is on the page.
    await expect(page.getByRole('navigation', { name: 'ניווט באזור האישי' })).toBeVisible()

    await bar.getByRole('link', { name: 'כתובות' }).click()
    await expect(page).toHaveURL(/\/account\/addresses$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('כתובות')
    await expect(bar.getByRole('link', { name: 'כתובות' })).toHaveAttribute('aria-current', 'page')

    await bar.getByRole('link', { name: 'הגדרות' }).click()
    await expect(page).toHaveURL(/\/account\/settings$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('הגדרות')
    await expect(bar.getByRole('link', { name: 'הגדרות' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByLabel('שם מלא')).toBeVisible()
    await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  })

  test('a child route keeps its tab current, and the old details address lands on settings', async ({
    page,
  }) => {
    const bar = page.getByRole('navigation', { name: 'אזורי החשבון' })

    await page.goto('/account/notifications')
    await expect(bar.getByRole('link', { name: 'הגדרות' })).toHaveAttribute('aria-current', 'page')

    await page.goto('/account/return')
    await expect(bar.getByRole('link', { name: 'ההזמנות שלי' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.goto('/account/details')
    await expect(page).toHaveURL(/\/account\/settings$/)
    await expect(bar.getByRole('link', { name: 'הגדרות' })).toHaveAttribute('aria-current', 'page')

    // A page outside the five lights nothing.
    await page.goto('/account/wallet')
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(0)
  })

  test('the tabs are one row of 44px links, and on a phone they come before the side nav', async ({
    page,
  }, testInfo) => {
    await page.goto('/account/orders')
    const bar = page.getByRole('navigation', { name: 'אזורי החשבון' })
    await expect(bar).toBeVisible()
    const barBox = await bar.boundingBox()
    expect(barBox).not.toBeNull()
    for (const label of TABS) {
      const box = await bar.getByRole('link', { name: label }).boundingBox()
      expect(box, label).not.toBeNull()
      expect(box?.height ?? 0, `${label} height`).toBeGreaterThanOrEqual(44)
      // One row: every link's top is the bar's top.
      expect(Math.abs((box?.y ?? 0) - (barBox?.y ?? 0)), `${label} row`).toBeLessThan(2)
    }

    const nav = page.getByRole('navigation', { name: 'ניווט באזור האישי' })
    await expect(nav).toBeVisible()
    const navBox = await nav.boundingBox()
    const content = page.locator('.account-content')
    const contentBox = await content.boundingBox()
    expect(navBox).not.toBeNull()
    expect(contentBox).not.toBeNull()

    const width = page.viewportSize()?.width ?? 1280
    if (width <= 900) {
      // Phone: tabs, then the nav, then the content, stacked.
      expect((barBox?.y ?? 0) < (navBox?.y ?? 0), 'tabs above the nav').toBe(true)
      expect(
        (barBox?.y ?? 0) + (barBox?.height ?? 0) <= (navBox?.y ?? 0) + 1,
        'tabs end before the nav starts',
      ).toBe(true)
    } else {
      // Desktop: the tabs sit over the content column, beside the nav, and
      // the content starts under the tabs, not under the nav.
      expect(Math.abs((barBox?.y ?? 0) - (navBox?.y ?? 0)), 'tabs level with the nav').toBeLessThan(
        2,
      )
      expect(
        Math.abs((barBox?.x ?? 0) - (contentBox?.x ?? 0)),
        'tabs over the content',
      ).toBeLessThan(2)
      expect(
        (contentBox?.y ?? 0) >= (barBox?.y ?? 0) + (barBox?.height ?? 0),
        'content under tabs',
      ).toBe(true)
    }
    testInfo.annotations.push({
      type: 'geometry',
      description: JSON.stringify({ width, bar: barBox, nav: navBox, content: contentBox }),
    })
  })
})
