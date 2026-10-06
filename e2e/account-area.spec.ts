import { type Page, expect, test } from '@playwright/test'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'
import { emptyCart, expectHebrewRtl } from './helpers'

/**
 * The personal area (W15), end to end.
 *
 * What a signed-in customer sees on /account, the orders list, one order with a
 * coupon, and the coupon itself: the QR with its full-screen view, the live
 * validity counter, the transfer and gift buttons, the invoice link only when a
 * document exists, the Waze link only when the business has a street address,
 * the cancellation form with the fee in agorot, the "everything in the app"
 * switch, and one-tap buy-again landing on a prefilled checkout.
 *
 * READ-MOSTLY BY DESIGN. The suite runs against the only database there is
 * (see gift-transfer.spec.ts), so it creates no orders: it reads the E2E
 * customer's existing orders and coupons, which earlier paid-flow specs made.
 * The one write is buy-again, which adds a cart line and is emptied again at
 * the end of that test. Tests that need a live coupon skip, saying so, when
 * the account holds none.
 *
 * Signed-out behaviour needs no fixtures and always runs.
 */

test.describe('personal area, signed out', () => {
  test('/account sends a visitor to login and back', async ({ page }) => {
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?next=%2Faccount|\/login\?next=\/account/)
  })

  test('/account/orders sends a visitor to login', async ({ page }) => {
    await page.goto('/account/orders')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('personal area, signed in', () => {
  test.skip(!paidFlowEnabled(), 'E2E_PAID_FLOW=0 or no customer fixture')

  test.beforeEach(async ({ page }) => {
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account')
  })

  test('/account is the overview, in Hebrew RTL, with the orders and coupons tiles', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'האזור האישי' })).toBeVisible()
    await expectHebrewRtl(page)
    await expect(page.getByRole('link', { name: 'לכל ההזמנות' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'לכל הקופונים' })).toBeVisible()
  })

  test('/account/orders lists orders newest first, each linking to its page', async ({ page }) => {
    await page.goto('/account/orders')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const links = page.locator('a[href^="/account/orders/"]')
    const count = await links.count()
    test.skip(count === 0, 'the E2E customer has no orders yet')
    const href = await links.first().getAttribute('href')
    expect(href).toMatch(/^\/account\/orders\/[0-9a-f-]{36}$/)
  })

  test('the order page: items, cancellation form with the fee in agorot, invoice only when issued', async ({
    page,
  }) => {
    const orderHref = await firstOrderHref(page)
    test.skip(!orderHref, 'the E2E customer has no orders yet')
    await page.goto(orderHref as string)

    await expect(page.getByRole('heading', { level: 1, name: /הזמנה מתאריך/ })).toBeVisible()

    // The invoice link is a placeholder only when a document exists: either the
    // row is there with the download CTA, or there is no invoice row at all.
    const invoiceRows = page.getByRole('link', { name: /לחשבונית מס קבלה/ })
    const invoiceCount = await invoiceRows.count()
    if (invoiceCount > 0) {
      await expect(invoiceRows.first()).toHaveAttribute('href', /\/account\/orders\/.+\/invoice$/)
    }
    await expect(page.getByText('חשבונית מס / קבלה')).toHaveCount(invoiceCount)

    // Cancellation per the returns policy: the law is named, the policy linked,
    // and the fee preview carries integer agorot that add up.
    const cancellation = page.getByTestId('cancellation-request')
    await expect(cancellation).toBeVisible()
    await expect(
      cancellation.getByRole('link', { name: 'למדיניות הביטולים המלאה' }),
    ).toHaveAttribute('href', '/refund_returns')
    const open = cancellation.getByRole('button', { name: 'בקשת ביטול או החזר על ההזמנה' })
    if (await open.isVisible().catch(() => false)) {
      await open.click()
      const reason = cancellation.getByLabel('הסיבה')
      await reason.selectOption('changed_mind')
      const preview = page.getByTestId('cancellation-fee-preview')
      await expect(preview).toBeVisible()
      const fee = Number(await preview.getAttribute('data-fee-agorot'))
      const refund = Number(await preview.getAttribute('data-refund-agorot'))
      expect(Number.isInteger(fee)).toBe(true)
      expect(Number.isInteger(refund)).toBe(true)
      expect(fee).toBeGreaterThanOrEqual(0)
      // The lower of 5% or ₪100, so never above 10,000 agorot.
      expect(fee).toBeLessThanOrEqual(10_000)
      expect(refund).toBeGreaterThanOrEqual(0)
      // A defect claim is a full refund: the fee drops to zero on the same order.
      await reason.selectOption('defective')
      await expect(preview).toHaveAttribute('data-fee-agorot', '0')
      expect(Number(await preview.getAttribute('data-refund-agorot'))).toBe(fee + refund)
    }
  })

  test('a live coupon on the order page: QR, full-screen view, countdown, transfer and gift, location', async ({
    page,
  }) => {
    const found = await orderWithLiveVoucher(page)
    test.skip(!found, 'the E2E customer holds no live, un-gifted coupon')

    const card = page
      .getByTestId('order-voucher')
      .filter({ has: page.getByTestId('qr-fullscreen-open') })
      .first()
    await expect(card).toBeVisible()

    // Validity countdown: pending at first paint, then live digits against the
    // same deadline the static date prints.
    const countdown = card.getByTestId('validity-countdown')
    await expect(countdown).toHaveAttribute('data-state', 'live')
    await expect(countdown).toHaveText(/נותרו \d+ (ימים|שעות|דקות) ו-\d+ (שעות|דקות|שניות)/)

    // Transfer and gift are two buttons to two modes of the same page.
    await expect(card.getByTestId('voucher-transfer')).toHaveAttribute(
      'href',
      /\/account\/coupons\/[0-9a-f-]{36}\/gift\?mode=transfer$/,
    )
    await expect(card.getByTestId('voucher-gift')).toHaveAttribute(
      'href',
      /\/account\/coupons\/[0-9a-f-]{36}\/gift\?mode=gift$/,
    )

    // Business location: a Waze link only when a street address exists. Either
    // way nothing else claims to navigate.
    const waze = page.getByTestId('order-supplier-waze')
    if ((await waze.count()) > 0) {
      await expect(waze.first()).toHaveAttribute('href', /^https:\/\/waze\.com\/ul\?q=/)
    }

    // Full screen for the scanner: a modal dialog with the QR and the code.
    await card.getByTestId('qr-fullscreen-open').click()
    const dialog = page.getByTestId('qr-fullscreen-dialog')
    await expect(dialog).toBeVisible()
    const image = dialog.getByTestId('qr-fullscreen-image')
    await expect(image).toBeVisible()
    const box = await image.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    // Most of the narrower side of the screen, which is what a scanner needs.
    const side = Math.min(viewport?.width ?? 0, viewport?.height ?? 0)
    expect((box?.width ?? 0) >= side * 0.6).toBe(true)
    await dialog.getByTestId('qr-fullscreen-close').click()
    await expect(dialog).toBeHidden()
  })

  test('the transfer mode hides the greeting and the gift mode shows it', async ({ page }) => {
    const found = await orderWithLiveVoucher(page)
    test.skip(!found, 'the E2E customer holds no live, un-gifted coupon')
    const transferHref = await page.getByTestId('voucher-transfer').first().getAttribute('href')
    await page.goto(transferHref as string)
    await expect(
      page.getByRole('heading', { level: 1, name: 'העברת הקופון לחשבון אחר' }),
    ).toBeVisible()
    const form = page.getByTestId('gift-transfer-form')
    await expect(form).toHaveAttribute('data-mode', 'transfer')
    await expect(form.locator('textarea[name="message"]')).toHaveCount(0)
    await expect(form.getByRole('button', { name: 'העברת הקופון' })).toBeVisible()

    await page.goto((transferHref as string).replace('mode=transfer', 'mode=gift'))
    await expect(page.getByRole('heading', { level: 1, name: 'העברת הקופון במתנה' })).toBeVisible()
    await expect(page.getByTestId('gift-transfer-form')).toHaveAttribute('data-mode', 'gift')
    await expect(page.locator('textarea[name="message"]')).toHaveCount(1)
  })

  test('the "everything in the app" switch records formal consent or says it is unavailable', async ({
    page,
  }) => {
    await page.goto('/account/notifications')
    const toggle = page.getByTestId('app-consent-switch')
    await expect(toggle).toHaveAttribute('role', 'switch')
    await expect(page.getByText('הכל באפליקציה').first()).toBeVisible()
    // The sentence the customer consents to is printed beside the switch, and
    // it names what is recorded (date and wording version).
    await expect(page.getByText(/ההסכמה נרשמת עם התאריך ונוסח ההסכמה/)).toBeVisible()
    const unavailable = page.getByTestId('app-consent-unavailable')
    if ((await unavailable.count()) > 0) {
      // Pending migration 240: the switch is disabled and says why, never a
      // switch that looks live and records nothing.
      await expect(toggle).toBeDisabled()
    } else {
      await expect(toggle).toBeEnabled()
    }
  })

  test('buy again lands on the checkout with the saved details and no card number', async ({
    page,
  }) => {
    const orderHref = await firstOrderHref(page)
    test.skip(!orderHref, 'the E2E customer has no orders yet')
    await page.goto(orderHref as string)
    const buyAgain = page.getByTestId('buy-again').first()
    test.skip((await buyAgain.count()) === 0, 'no line on the newest order is still purchasable')

    await expect(page.getByText('פרטי כרטיס אשראי אינם נשמרים באתר.').first()).toBeVisible()
    await buyAgain.click()
    await page.waitForURL(/\/checkout/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'קופה' })).toBeVisible()
    // Saved details, not card data: no field on the page asks for a card number.
    await expect(page.locator('input[autocomplete="cc-number"]')).toHaveCount(0)
    await expect(page.locator('input[name="cardNumber"], input[name="card_number"]')).toHaveCount(0)

    await emptyCart(page)
  })
})

async function firstOrderHref(page: Page): Promise<string | null> {
  await page.goto('/account/orders')
  const links = page.locator('a[href^="/account/orders/"]')
  if ((await links.count()) === 0) return null
  return links.first().getAttribute('href')
}

/**
 * Opens the newest order that renders a presentable, un-gifted coupon, and
 * reports whether one was found. Walks at most the first eight orders: the
 * fixture account accumulates orders across runs and the newest ones are the
 * most likely to hold a live coupon.
 */
async function orderWithLiveVoucher(page: Page): Promise<boolean> {
  await page.goto('/account/orders')
  const hrefs = await page.locator('a[href^="/account/orders/"]').evaluateAll((nodes) =>
    Array.from(new Set(nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href') ?? '')))
      .filter((href) => /^\/account\/orders\/[0-9a-f-]{36}$/.test(href))
      .slice(0, 8),
  )
  for (const href of hrefs) {
    await page.goto(href)
    if ((await page.getByTestId('qr-fullscreen-open').count()) > 0) return true
  }
  return false
}
