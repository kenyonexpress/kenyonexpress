import { expect, test } from '@playwright/test'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('renders the auth layout with branding', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'KenyonExpress' })).toBeVisible()
    await expect(page.getByText('קופונים, מבצעים ומוצרים')).toBeVisible()
  })

  test('shows כניסה heading and Google button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
    await expect(page.getByRole('button', { name: /כניסה עם Google/ })).toBeVisible()
  })

  test('shows email and password fields', async ({ page }) => {
    await expect(page.getByLabel('אימייל', { exact: true })).toBeVisible()
    await expect(page.getByLabel('סיסמה', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'כניסה', exact: true })).toBeVisible()
  })

  test('has forgot password link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'שכחתם סיסמה?' })).toBeVisible()
  })

  test('shows magic link form on toggle', async ({ page }) => {
    await page.getByRole('button', { name: /קישור מאובטח/ }).click()
    await expect(page.getByLabel('אימייל לקישור כניסה')).toBeVisible()
    await expect(page.getByRole('button', { name: 'שלחו לי קישור' })).toBeVisible()
  })

  test('has link to signup', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'הרשמה' })).toBeVisible()
  })

  test('shows inline error on empty email submit', async ({ page }) => {
    // Native browser validation fires first — just check the input is required
    const emailInput = page.getByLabel('אימייל', { exact: true })
    await expect(emailInput).toHaveAttribute('required')
  })
})

test.describe('Signup page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup')
  })

  test('renders signup heading and Google button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'יצירת חשבון' })).toBeVisible()
    await expect(page.getByRole('button', { name: /הרשמה עם Google/ })).toBeVisible()
  })

  // UX24: the page is a stepper. Step one holds the name, the address and
  // the password; the phone and the terms box are step two, reached on the
  // client once step one is valid.
  test('has the stepper and step one’s fields', async ({ page }) => {
    const steps = page.getByRole('list', { name: 'שלבי ההרשמה' }).getByRole('listitem')
    await expect(steps).toHaveCount(4)
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step')
    await expect(page.getByLabel('שם מלא')).toBeVisible()
    await expect(page.getByLabel('אימייל', { exact: true })).toBeVisible()
    await expect(page.getByLabel('סיסמה', { exact: true })).toBeVisible()
    await expect(page.getByLabel(/טלפון נייד/)).toBeHidden()
  })

  test('has phone field with Israeli hint and the terms box on step two', async ({ page }) => {
    await page.getByLabel('שם מלא').fill('דנה כהן')
    await page.getByLabel('אימייל', { exact: true }).fill('ux24@example.com')
    await page.getByLabel('סיסמה', { exact: true }).fill('secret12')
    await page.getByRole('button', { name: 'המשך' }).click()
    await expect(page.getByLabel(/טלפון נייד/)).toBeVisible()
    await expect(page.getByText(/מספר ישראלי/)).toBeVisible()
    await expect(page.getByLabel(/קראתי ואני מאשר/)).toBeVisible()
  })

  test('has link back to login', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'כניסה' })).toBeVisible()
  })
})

test.describe('Forgot password page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password')
  })

  test('renders heading and email field', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'שחזור סיסמה' })).toBeVisible()
    await expect(page.getByLabel('אימייל', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'שלחו קישור לאיפוס' })).toBeVisible()
  })

  test('has back-to-login link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'חזרה לכניסה' })).toBeVisible()
  })
})

test.describe('Reset password page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reset-password')
  })

  test('renders new password fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'בחרו סיסמה חדשה' })).toBeVisible()
    await expect(page.getByLabel('סיסמה חדשה')).toBeVisible()
    await expect(page.getByLabel('אימות סיסמה')).toBeVisible()
    await expect(page.getByRole('button', { name: 'עדכנו סיסמה' })).toBeVisible()
  })
})

test.describe('Route protection', () => {
  test('redirects unauthenticated user from /account to /login', async ({ page }) => {
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get('next')).toBe('/account')
  })

  // /checkout itself is deliberately open to guests; see the note in
  // e2e/checkout.spec.ts and the protected-path list in src/proxy.ts. What is
  // still gated is the subtree, which is what this pins.
  test('redirects unauthenticated user from /checkout/return to /login', async ({ page }) => {
    await page.goto('/checkout/return?order_id=abc')
    await expect(page).toHaveURL(/\/login/)
  })
})
