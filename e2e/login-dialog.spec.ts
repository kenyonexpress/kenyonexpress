import { expect, test } from '@playwright/test'
import { E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, paidFlowEnabled } from './auth-session'

/**
 * UX23: the login dialog on a built server. The top bar's התחברות is still an
 * anchor to /login; with the storefront chrome mounted, a plain press opens
 * the dialog over the page the shopper is on instead of leaving it, with
 * `next` set to that page. The dialog has the /login card's body (Google, the
 * passkey where supported, the email / SMS tabs, the magic-link fallback),
 * traps Tab, closes on Escape and the overlay, and gives focus back to the
 * link. A modified press keeps the navigation, and the page itself keeps
 * every control it had.
 */

const ACCOUNT_LINK = { name: 'התחברות', exact: true } as const

test.describe('login dialog (UX23)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('ke_consent', 'denied.2')
    })
    await context.addCookies([
      { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' },
    ])
  })

  test('a press on the top bar link opens the dialog over the page with next set to it', async ({
    page,
  }) => {
    await page.goto('/products?page=2')
    const link = page.getByRole('link', ACCOUNT_LINK).first()
    await expect(link).toHaveAttribute('href', '/login')
    await link.click()
    const dialog = page.getByRole('dialog', { name: 'כניסה לחשבון' })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/products\?page=2$/)
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('heading', { level: 2, name: 'כניסה לחשבון' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /כניסה עם Google/ })).toBeVisible()
    await expect(dialog.getByLabel('אימייל', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('סיסמה', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /קישור מאובטח/ })).toBeVisible()
    await expect(dialog.locator('input[name="next"]').first()).toHaveValue('/products?page=2')
    // Focus is on the labelled panel, so the title is read before any control.
    await expect(dialog).toBeFocused()
    // The page behind cannot scroll while the dialog is up.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .toBe('hidden')
  })

  test('the controls are on the touch floor and the panel fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 700 })
    await page.goto('/')
    await page.getByRole('link', ACCOUNT_LINK).first().click()
    const dialog = page.getByRole('dialog', { name: 'כניסה לחשבון' })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box, 'the dialog has a box').not.toBeNull()
    expect(box?.width ?? 0).toBeLessThanOrEqual(380 - 2 * 15)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(700)
    for (const name of ['סגירה', 'כניסה', 'שלחו לי קישור']) {
      const button = dialog.getByRole('button', { name, exact: true })
      if (name === 'שלחו לי קישור') {
        await dialog.getByRole('button', { name: /קישור מאובטח/ }).click()
      }
      const b = await button.boundingBox()
      expect(b?.height ?? 0, `${name} is at least 44px tall`).toBeGreaterThanOrEqual(44)
    }
  })

  test('Escape closes it and gives focus back to the link; the overlay closes it too', async ({
    page,
  }) => {
    await page.goto('/')
    const link = page.getByRole('link', ACCOUNT_LINK).first()
    await link.click()
    const dialog = page.getByRole('dialog', { name: 'כניסה לחשבון' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(link).toBeFocused()
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .not.toBe('hidden')
    await link.click()
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: 'סגירת חלון הכניסה' }).click({
      position: { x: 4, y: 4 },
    })
    await expect(dialog).toBeHidden()
  })

  test('Tab stays inside the dialog in both directions', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', ACCOUNT_LINK).first().click()
    const dialog = page.getByRole('dialog', { name: 'כניסה לחשבון' })
    await expect(dialog).toBeVisible()
    const inside = () =>
      page.evaluate(() => {
        const d = document.querySelector('.login-dialog')
        return !!d && d.contains(document.activeElement)
      })
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab')
      expect(await inside(), `Tab ${i + 1} stayed inside`).toBe(true)
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside(), `Shift+Tab ${i + 1} stayed inside`).toBe(true)
    }
  })

  test('a modified press keeps the navigation: the link is still a link', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    const link = page.getByRole('link', ACCOUNT_LINK).first()
    const popup = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
    await link.click({ modifiers: ['ControlOrMeta'] })
    const opened = await popup
    expect(opened, 'a ctrl/cmd press opened a new page').not.toBeNull()
    await opened?.waitForURL(/\/login$/, { timeout: 15_000 })
    expect(opened?.url() ?? '').toMatch(/\/login$/)
    await expect(page.locator('.login-dialog')).toHaveCount(0)
    await opened?.close()
  })

  test('/login keeps its whole card: the page is the fallback for every other door', async ({
    page,
  }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
    await expect(page.getByRole('button', { name: /כניסה עם Google/ })).toBeVisible()
    // exact: the email tabpanel is labelled by its tab, "אימייל וסיסמה".
    await expect(page.getByLabel('אימייל', { exact: true })).toHaveAttribute('id', 'login-email')
    await expect(page.getByRole('link', { name: 'הרשמה' })).toBeVisible()
    await expect(page.locator('.login-dialog')).toHaveCount(0)
    // The tab strip renders only when an SMS provider is wired in.
    const tabs = page.getByRole('tablist', { name: 'דרך הכניסה' })
    if (await tabs.count()) {
      await expect(tabs.getByRole('tab', { name: 'אימייל וסיסמה' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await tabs.getByRole('tab', { name: 'קוד ב-SMS' }).click()
      await expect(page.getByLabel('מספר טלפון נייד')).toBeVisible()
      await expect(page.getByLabel('אימייל', { exact: true })).toBeHidden()
    }
  })

  test('a sign-in through the dialog lands back on the page it opened from', async ({ page }) => {
    test.skip(!paidFlowEnabled(), 'E2E customer credentials are not configured')
    await page.goto('/products')
    await page.getByRole('link', ACCOUNT_LINK).first().click()
    const dialog = page.getByRole('dialog', { name: 'כניסה לחשבון' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('אימייל', { exact: true }).fill(E2E_CUSTOMER_EMAIL)
    await dialog.getByLabel('סיסמה', { exact: true }).fill(E2E_CUSTOMER_PASSWORD)
    await dialog.getByRole('button', { name: 'כניסה', exact: true }).click()
    await page.waitForURL(/\/products(\?.*)?$/, { timeout: 20_000 })
    await expect(page.locator('.login-dialog')).toHaveCount(0)
    // Now signed in: the same press answers with the account, not the form.
    await page.getByRole('link', ACCOUNT_LINK).first().click()
    await expect(page.getByTestId('login-dialog-signed-in')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: 'לאזור האישי' })).toHaveAttribute(
      'href',
      '/account',
    )
  })
})
