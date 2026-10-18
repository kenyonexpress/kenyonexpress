import { expect, test } from '@playwright/test'

/**
 * UX24: the register stepper on a built server. Inside the login dialog
 * (UX23) the הרשמה link is still an anchor to /signup; a plain press switches
 * the dialog to the register body in place, with the stepper, step one's
 * three fields, and the phone + terms step after a client-side advance that
 * sends nothing. The terms box is required before any request. /signup
 * carries the same stepper. No account is created here: the local build
 * talks to the hosted project, and a registration is a real row.
 */

const ACCOUNT_LINK = { name: 'התחברות', exact: true } as const

async function openRegister(page: import('@playwright/test').Page) {
  await page.getByRole('link', ACCOUNT_LINK).first().click()
  const login = page.getByRole('dialog', { name: 'כניסה לחשבון' })
  await expect(login).toBeVisible()
  await login.getByRole('link', { name: 'הרשמה' }).click()
  const dialog = page.getByRole('dialog', { name: 'יצירת חשבון' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('register dialog (UX24)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('ke_consent', 'denied.2')
    })
    await context.addCookies([
      { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' },
    ])
  })

  test('הרשמה inside the login dialog switches to the stepper without leaving the page', async ({
    page,
  }) => {
    await page.goto('/products?page=2')
    const dialog = await openRegister(page)
    await expect(page).toHaveURL(/\/products\?page=2$/)
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toBeFocused()
    const steps = dialog.getByRole('list', { name: 'שלבי ההרשמה' }).getByRole('listitem')
    await expect(steps).toHaveCount(4)
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step')
    // Each item is its number (aria-hidden) and its label.
    await expect(steps).toHaveText([/פרטים$/, /טלפון ותנאים$/, /אימות הטלפון$/, /ברוכים הבאים$/])
    await expect(dialog.getByRole('button', { name: /הרשמה עם Google/ })).toBeVisible()
    await expect(dialog.getByLabel('שם מלא')).toBeVisible()
    await expect(dialog.getByLabel('אימייל', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('סיסמה', { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('טלפון נייד')).toBeHidden()
    await expect(dialog.locator('input[name="next"]').first()).toHaveValue('/products?page=2')
    // And back to the login body, still in place.
    await dialog.getByRole('link', { name: 'כניסה' }).click()
    await expect(page.getByRole('dialog', { name: 'כניסה לחשבון' })).toBeVisible()
    await expect(page).toHaveURL(/\/products\?page=2$/)
  })

  test('step one refuses on the client with no request, advances on valid details, and keeps them on the way back', async ({
    page,
  }) => {
    await page.goto('/')
    const dialog = await openRegister(page)
    const posts: string[] = []
    page.on('request', (request) => {
      // Exclude React dev-mode debug endpoints that aren't part of the form submission
      const url = request.url()
      if (request.method() === 'POST' && !url.includes('__nextjs_original-stack-frames')) {
        posts.push(url)
      }
    })
    await dialog.getByRole('button', { name: 'המשך' }).click()
    await expect(dialog.getByText('שם מלא חייב להכיל לפחות 2 תווים')).toBeVisible()
    await expect(dialog.getByLabel('שם מלא')).toBeFocused()
    expect(posts).toEqual([])

    await dialog.getByLabel('שם מלא').fill('דנה כהן')
    await dialog.getByLabel('אימייל', { exact: true }).fill('ux24@example.com')
    await dialog.getByLabel('סיסמה', { exact: true }).fill('secret12')
    await dialog.getByRole('button', { name: 'המשך' }).click()
    const steps = dialog.getByRole('list', { name: 'שלבי ההרשמה' }).getByRole('listitem')
    await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step')
    await expect(dialog.getByRole('heading', { level: 3, name: 'טלפון ותנאים' })).toBeFocused()
    await expect(dialog.getByLabel('טלפון נייד')).toBeVisible()
    await expect(dialog.getByLabel(/קראתי ואני מאשר/)).not.toBeChecked()
    await expect(dialog.getByLabel('שם מלא')).toBeHidden()
    expect(posts).toEqual([])

    await dialog.getByRole('button', { name: 'חזרה לפרטים' }).click()
    await expect(dialog.getByLabel('שם מלא')).toHaveValue('דנה כהן')
    await expect(dialog.getByLabel('אימייל', { exact: true })).toHaveValue('ux24@example.com')
  })

  test('the terms box is required before anything is sent, and links both documents', async ({
    page,
  }) => {
    await page.goto('/')
    const dialog = await openRegister(page)
    await dialog.getByLabel('שם מלא').fill('דנה כהן')
    await dialog.getByLabel('אימייל', { exact: true }).fill('ux24@example.com')
    await dialog.getByLabel('סיסמה', { exact: true }).fill('secret12')
    await dialog.getByRole('button', { name: 'המשך' }).click()
    const posts: string[] = []
    page.on('request', (request) => {
      // Exclude React dev-mode debug endpoints that aren't part of the form submission
      const url = request.url()
      if (request.method() === 'POST' && !url.includes('__nextjs_original-stack-frames')) {
        posts.push(url)
      }
    })
    await dialog.getByLabel('טלפון נייד').fill('0501234567')
    await expect(dialog.getByRole('link', { name: 'תנאי השימוש' })).toHaveAttribute(
      'href',
      '/terms-and-conditions',
    )
    await expect(dialog.getByRole('link', { name: 'מדיניות הפרטיות' })).toHaveAttribute(
      'href',
      '/privacy-policy',
    )
    await dialog.getByRole('button', { name: 'יצירת חשבון' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(
      'כדי להירשם יש לאשר את תנאי השימוש ומדיניות הפרטיות',
    )
    await expect(dialog.getByLabel(/קראתי ואני מאשר/)).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByLabel(/קראתי ואני מאשר/)).toBeFocused()
    expect(posts).toEqual([])
  })

  test('the controls are on the touch floor and the panel fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 700 })
    await page.goto('/')
    const dialog = await openRegister(page)
    const box = await dialog.boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(380 - 2 * 15)
    for (const button of await dialog.getByRole('button').all()) {
      if (!(await button.isVisible())) continue
      const b = await button.boundingBox()
      expect(b?.height ?? 0, await button.innerText()).toBeGreaterThanOrEqual(44)
    }
    await dialog.getByLabel('שם מלא').fill('דנה כהן')
    await dialog.getByLabel('אימייל', { exact: true }).fill('ux24@example.com')
    await dialog.getByLabel('סיסמה', { exact: true }).fill('secret12')
    await dialog.getByRole('button', { name: 'המשך' }).click()
    const terms = await dialog.locator('.register-terms').boundingBox()
    expect(terms?.height ?? 0).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'יצירת חשבון' })).toHaveCount(0)
  })

  test('a direct /signup link opens the stepper too, and the page carries the same body', async ({
    page,
  }) => {
    await page.goto('/signup')
    await expect(page.getByRole('heading', { level: 2, name: 'יצירת חשבון' })).toBeVisible()
    const steps = page.getByRole('list', { name: 'שלבי ההרשמה' }).getByRole('listitem')
    await expect(steps).toHaveCount(4)
    await expect(page.getByLabel('שם מלא')).toHaveAttribute('id', 'register-full_name')
    await expect(page.getByRole('link', { name: 'כניסה' })).toHaveAttribute('href', '/login')
  })
})
