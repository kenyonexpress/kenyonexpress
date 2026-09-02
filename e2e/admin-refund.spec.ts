import { expect, test } from '@playwright/test'
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_COUPON_SLUG,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'
import { addProductBySlug, fillCheckoutAndPay } from './checkout-flow'

test.describe('admin refund to wallet @checkout @money', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('admin refunds a paid coupon order pending → wallet_credited → ledger', async ({
    browser,
  }) => {
    const customer = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await customer.newPage()
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/')
    await addProductBySlug(page, E2E_COUPON_SLUG)
    await page.goto('/checkout')
    await fillCheckoutAndPay(page)
    const url = page.url()
    const orderId = new URL(url).searchParams.get('order_id')
    expect(orderId).toBeTruthy()
    await customer.close()

    const admin = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const adminPage = await admin.newPage()
    await signInWithEmail(
      adminPage,
      E2E_ADMIN_EMAIL,
      E2E_ADMIN_PASSWORD,
      `/admin/orders/${orderId}`,
    )
    await adminPage.goto(`/admin/orders/${orderId}`)
    await expect(adminPage.getByRole('heading', { name: 'פרטי הזמנה' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(adminPage.getByText('פלטפורמה')).toBeVisible()

    const walletBox = adminPage.locator('[data-refund-destination="wallet"]')
    await expect(walletBox).toBeVisible()
    await adminPage.locator('#wallet-refund-reason').fill('בדיקת E2E החזר לארנק')
    await adminPage.getByRole('button', { name: 'יזום החזר לארנק' }).click()
    await expect(walletBox).toHaveAttribute('data-refund-state', 'pending')
    await adminPage.getByRole('button', { name: 'אישור סופי, זיכוי לארנק' }).click()
    await expect(walletBox).toHaveAttribute('data-refund-state', 'wallet_credited', {
      timeout: 20_000,
    })
    await expect(adminPage.getByText(/הארנק זוכה|wallet_credited/)).toBeVisible()
    await admin.close()

    const walletCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const walletPage = await walletCtx.newPage()
    await signInWithEmail(walletPage, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account/wallet')
    await walletPage.goto('/account/wallet')
    await expect(walletPage.getByRole('heading', { name: 'הארנק שלי' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(walletPage.getByText('החזר על ביטול')).toBeVisible()
    await walletCtx.close()
  })
})
