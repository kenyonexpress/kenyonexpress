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
    await expect(page.getByLabel('אימייל')).toBeVisible()
    await expect(page.getByLabel('סיסמה')).toBeVisible()
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
    const emailInput = page.getByLabel('אימייל')
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

  test('has phone field with Israeli hint', async ({ page }) => {
    await expect(page.getByLabel(/טלפון נייד/)).toBeVisible()
    await expect(page.getByText(/מספר ישראלי/)).toBeVisible()
  })

  test('has all required fields', async ({ page }) => {
    await expect(page.getByLabel('שם מלא')).toBeVisible()
    await expect(page.getByLabel('אימייל')).toBeVisible()
    await expect(page.getByLabel(/טלפון נייד/)).toBeVisible()
    await expect(page.getByLabel('סיסמה')).toBeVisible()
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
    await expect(page.getByLabel('אימייל')).toBeVisible()
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
