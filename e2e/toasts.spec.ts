import { expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  completeAdminMfaIfAsked,
  signInWithEmail,
} from './auth-session'
import { BUY_BUTTON, openPurchasableProduct } from './helpers'

/**
 * UX28: the toast is one thing on this site, on a built server.
 *
 * Measured before (logs/ux28/before.json, the build of a1ee1c030): four
 * identical "נוסף להשוואה" presses were four toasts (three visible, one
 * queued); an error lived 4.1s against a success's 4.0s; the close button was
 * a 20px glyph named "Close toast" whose hit box was its paint; a dark OS got
 * a black toast on the white site; and the admin panel had no toast region
 * at all while its screens raised twenty-five toasts.
 */

type Page = import('@playwright/test').Page

const TOAST = '[data-sonner-toast]'
const SUCCESS = `${TOAST}[data-type="success"]`
const ERROR = `${TOAST}[data-type="error"]`

async function preset(page: Page) {
  const base = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000')
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE,
      value: serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION }),
      domain: base.hostname,
      path: '/',
    },
  ])
}

/** True when `elementFromPoint` 21px out from the button's centre, on all four sides, is the button. */
async function hitBoxReaches44(page: Page, selector: string): Promise<boolean[]> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return [false, false, false, false]
    const b = el.getBoundingClientRect()
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const inside = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)
      return !!hit && (hit === el || el.contains(hit))
    }
    return [inside(cx - 21, cy), inside(cx + 21, cy), inside(cx, cy - 21), inside(cx, cy + 21)]
  }, selector)
}

test.describe('toasts', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
  })

  test('an add-to-cart toast is light, named in Hebrew, closable on 44px and gone by itself', async ({
    page,
  }) => {
    await openPurchasableProduct(page)
    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    await expect(buy).toBeEnabled()
    await buy.click()

    const toast = page.locator(SUCCESS)
    await expect(toast).toHaveCount(1, { timeout: 20_000 })
    const appeared = Date.now()
    await expect(toast).toContainText('נוסף לעגלה')

    // The region: light on a light site, RTL, named in Hebrew.
    const toaster = page.locator('[data-sonner-toaster]').first()
    await expect(toaster).toHaveAttribute('data-sonner-theme', 'light')
    await expect(toaster).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('section[aria-label^="התראות"]')).toHaveCount(1)

    // The close button: a Hebrew name and a 44px hit box round a 20px glyph.
    // Measured after the 400ms enter slide has finished: `elementFromPoint`
    // hit-tests the toast where it IS, and mid-slide that is above its box.
    const close = toast.getByRole('button', { name: 'סגירת ההודעה' })
    await expect(close).toBeVisible()
    await page.waitForTimeout(Math.max(0, 700 - (Date.now() - appeared)))
    const painted = await close.boundingBox()
    expect(painted?.width ?? 0).toBeLessThanOrEqual(24)
    expect(await hitBoxReaches44(page, `${SUCCESS} [data-close-button]`)).toEqual([
      true,
      true,
      true,
      true,
    ])

    // Auto-dismiss: still there at 2.5s, gone by 6s (the success lifetime is 4s).
    await page.waitForTimeout(Math.max(0, 2500 - (Date.now() - appeared)))
    await expect(toast).toHaveCount(1)
    await expect(toast).toHaveCount(0, { timeout: 6_000 })
  })

  test('four identical compare presses are one toast, and the limit error outlives it', async ({
    page,
  }) => {
    await page.goto('/products')
    const add = page.locator('button[aria-label="הוסף להשוואה"]')
    await expect(add.first()).toBeAttached({ timeout: 20_000 })
    expect(await add.count()).toBeGreaterThanOrEqual(5)

    // Each press flips its button to "הסר מההשוואה", so nth(0) walks the grid.
    for (let i = 0; i < 4; i++) {
      await add.nth(0).click({ force: true })
      await page.waitForTimeout(150)
    }
    const success = page.locator(SUCCESS)
    await expect(success).toHaveCount(1)
    await expect(success).toContainText('נוסף להשוואה')
    expect(await page.locator(TOAST).count()).toBe(1)

    // The fifth is refused: an error toast beside the success, not instead of it.
    await add.nth(0).click({ force: true })
    const error = page.locator(ERROR)
    await expect(error).toHaveCount(1)
    await expect(error).toContainText('אפשר להשוות עד 4 מוצרים')

    // The success leaves first (4s); the error is still standing (8s).
    await expect(success).toHaveCount(0, { timeout: 7_000 })
    await expect(error).toHaveCount(1)
    await expect(error).toHaveCount(0, { timeout: 10_000 })
  })

  test('the admin panel paints its toasts', async ({ page }) => {
    // Before UX28 the (admin) layout mounted no toaster, so every admin
    // notify() was a call into the void. The trigger here is write-free: the
    // cashback action refuses a zero amount in validation, before any read.
    await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/cashback')
    // The login leaves /login before the panel's own redirect has settled.
    await page.waitForURL(
      (u) => u.pathname.startsWith('/admin-mfa') || u.pathname === '/admin/cashback',
      { timeout: 20_000 },
    )
    // Measured 15.10: the fixture in .env.local has no enrolled factor, and the
    // panel answers /admin/cashback with its ENROLMENT prompt in place (the URL
    // stays). Enrolling a TOTP factor on a real admin account is a production
    // write, so the case skips and the panel toast is pinned by
    // src/__tests__/toast-entry-points.test.ts instead.
    await completeAdminMfaIfAsked(page)
    const enrol = page.getByRole('button', { name: 'התחלת הגדרה' })
    const enrolShown = await enrol.waitFor({ state: 'visible', timeout: 5_000 }).then(
      () => true,
      () => false,
    )
    test.skip(
      enrolShown,
      'the admin fixture has no enrolled TOTP factor; enrolling one is a production write',
    )
    await expect(page).toHaveURL(/^[^?]*\/admin\/cashback/)
    await expect(page.getByLabel('אימייל הלקוח')).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('אימייל הלקוח').fill('ux28-e2e@example.com')
    await page.getByLabel('סכום בשקלים (שלילי לקיזוז)').fill('0')
    await page.getByLabel('נימוק (נרשם ביומן)').fill('בדיקת toast, סכום אפס נדחה לפני כל כתיבה')
    await page.getByRole('button', { name: 'בצע התאמה' }).click()
    const error = page.locator(ERROR)
    await expect(error).toHaveCount(1, { timeout: 15_000 })
    await expect(error).toContainText('הסכום חייב להיות שונה מאפס')
    await expect(page.locator('section[aria-label^="התראות"]')).toHaveCount(1)
    await expect(error.getByRole('button', { name: 'סגירת ההודעה' })).toBeVisible()
  })
})

test.describe('toasts under a dark OS', () => {
  test.use({ colorScheme: 'dark' })

  test('the site has no dark mode, so the toast stays light', async ({ page }) => {
    await preset(page)
    await openPurchasableProduct(page)
    await page.getByRole('button', { name: BUY_BUTTON }).first().click()
    const toast = page.locator(SUCCESS)
    await expect(toast).toHaveCount(1, { timeout: 20_000 })
    await expect(page.locator('[data-sonner-toaster]').first()).toHaveAttribute(
      'data-sonner-theme',
      'light',
    )
    const bg = await toast.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(236, 253, 243)')
  })
})
