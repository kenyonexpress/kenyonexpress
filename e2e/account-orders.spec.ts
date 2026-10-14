import { type Cookie, expect, test } from '@playwright/test'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'

/**
 * UX19: the order history as cards, on a built server, as the seeded
 * customer (who has paid orders from the money-path specs). Each card
 * carries its number, its status chips, a product preview and the total;
 * the toggle opens the lines in place without a navigation; "order again"
 * and the page link sit in the foot and are 44px tall on a phone.
 *
 * One password login per project, copied into each test's context as
 * cookies: the login limiter is 10 per hour per client IP.
 */
test.describe('account orders (UX19)', () => {
  test.skip(!paidFlowEnabled(), 'E2E customer fixture is disabled (E2E_PAID_FLOW=0)')

  let session: Cookie[] = []

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account/orders')
    session = (await page.context().storageState()).cookies
    await page.close()
  })

  test.beforeEach(async ({ context }) => {
    await context.addCookies(session)
  })

  test('each order is an article with a number, chips, a preview and a total', async ({ page }) => {
    await page.goto('/account/orders')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ההזמנות שלי')
    const cards = page.locator('article.order-card')
    const count = await cards.count()
    test.skip(count === 0, 'the E2E customer has no orders on this database')
    const first = cards.first()
    await expect(first.locator('.order-card__number')).toHaveText(/הזמנה #[0-9A-F]{8}/)
    await expect(first.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}/)
    const chips = first.getByRole('list', { name: 'סטטוס ההזמנה' }).locator('.account-chip')
    expect(await chips.count()).toBeGreaterThanOrEqual(1)
    await expect(first.locator('.order-card__preview')).not.toHaveText('')
    await expect(first.locator('.order-card__total-value')).toHaveText(/₪/)
    await expect(first.getByRole('link', { name: 'לעמוד ההזמנה' })).toHaveAttribute(
      'href',
      /^\/account\/orders\/[0-9a-f-]{36}$/,
    )
  })

  test('the toggle opens the lines in place and closes them again', async ({ page }) => {
    await page.goto('/account/orders')
    const first = page.locator('article.order-card').first()
    test.skip((await first.count()) === 0, 'the E2E customer has no orders on this database')
    // By class, not by name: the name flips to "הסתרת הפריטים" on open.
    const toggle = first.locator('button.order-card__toggle')
    await expect(toggle).toHaveText(/הצגת הפריט/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const panelId = await toggle.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = page.locator(`[id="${panelId}"]`)
    await expect(panel).toBeHidden()

    const url = page.url()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveText('הסתרת הפריטים')
    await expect(panel).toBeVisible()
    expect(await panel.locator('.order-card__line').count()).toBeGreaterThanOrEqual(1)
    await expect(panel.locator('.order-card__line-name').first()).not.toHaveText('')
    await expect(panel.locator('.order-card__line-meta').first()).toHaveText(/\d+ × /)
    // In place: no navigation.
    expect(page.url()).toBe(url)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(panel).toBeHidden()
  })

  test('the foot holds "order again" on a paid order and both actions are 44px tall', async ({
    page,
  }) => {
    await page.goto('/account/orders')
    const paid = page.locator('article.order-card', { hasText: 'הושלמה' }).first()
    test.skip((await paid.count()) === 0, 'the E2E customer has no completed order')
    const reorder = paid.getByRole('button', { name: /להזמין שוב|הזמנה חוזרת/ })
    await expect(reorder).toBeVisible()
    const link = paid.getByRole('link', { name: 'לעמוד ההזמנה' })
    for (const el of [reorder, link]) {
      const box = await el.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    // The text column is not squeezed beside the actions: the preview keeps
    // most of the card's width.
    const card = await paid.boundingBox()
    const preview = await paid.locator('.order-card__summary').boundingBox()
    expect((preview?.width ?? 0) / (card?.width ?? 1)).toBeGreaterThan(0.4)
  })

  test('an unpaid order offers no reorder', async ({ page }) => {
    await page.goto('/account/orders')
    const pending = page.locator('article.order-card[data-status="pending"]')
    test.skip((await pending.count()) === 0, 'the E2E customer has no unpaid order')
    await expect(
      pending.first().getByRole('button', { name: /להזמין שוב|הזמנה חוזרת/ }),
    ).toHaveCount(0)
  })
})
