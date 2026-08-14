import { expect, test } from '@playwright/test'
import { paidFlowEnabled } from './auth-session'
import { FIXTURE_SLUGS } from './db'
import { fixtureIsPurchasable, pressPayForCouponFixture } from './pay'

/**
 * The handoff to Cardcom, asserted as a handoff.
 *
 * WHAT THIS ADDS OVER full-purchase-redeem.spec.ts. That spec presses pay and
 * then waits for /checkout/return to say "התשלום הצליח". Under the mock
 * provider the hosted page IS /checkout/return, so a checkout that skipped the
 * provider entirely -- finalizing straight off the button, say, or falling back
 * to the wallet-covers-all branch -- would land on exactly the same page with
 * exactly the same heading and pass. The success page is where both a real
 * payment and a missing one arrive.
 *
 * So this asserts the leg BEFORE the arrival: that `provider.createLowProfile`
 * ran, that its `redirectUrl` reached the browser, and that the browser opened
 * it in the sandboxed frame rather than in the tab. Those three facts are what
 * "reached the payment provider" means, and none of them is visible from the
 * return page.
 *
 * WHY THE `lp=` PARAMETER IS THE TELL. MockCardcomProvider mints
 * `mock-lp-<n>-<paymentId prefix>` per deal and hands it back on the URL
 * (src/lib/payments/mock-cardcom.ts). It exists only if a deal was created. The
 * real provider puts its own low-profile id in the same position, so the shape
 * of this assertion survives the swap even though the value does not.
 */

test.describe('checkout reaches the Cardcom redirect stub @checkout @money', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(async ({ page }) => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
    test.skip(
      !(await fixtureIsPurchasable(page, FIXTURE_SLUGS.coupon)),
      'e2e-test-coupon is not purchasable; run pnpm seed:test',
    )
  })

  test('pressing pay opens the provider hosted page in the sandboxed frame', async ({ page }) => {
    const src = await pressPayForCouponFixture(page)

    // A deal was created: the id only exists because createLowProfile minted it.
    expect(src, `payment frame src was ${src}`).toMatch(/[?&]lp=mock-lp-/)
    // And it is the deal for THIS order, not a stale one replayed from an
    // earlier payment row.
    expect(src).toMatch(/[?&]order_id=[0-9a-f-]{36}/)
  })

  test('the payment page is framed, never navigated to in the tab', async ({ page }) => {
    await pressPayForCouponFixture(page)

    // The shopper must still be on /checkout while paying. Cardcom's own
    // navigation back into the frame is cross-site, and the Lax session cookie
    // is withheld on it -- which is the whole reason the return goes through
    // the frame-return stub instead of straight into a page that needs a
    // session. A checkout that moved the tab would look fine here and lose the
    // session on the way back.
    expect(new URL(page.url()).pathname).toBe('/checkout')
  })

  test('the frame is sandboxed and cannot move the tab out from under the shopper', async ({
    page,
  }) => {
    await pressPayForCouponFixture(page)

    const iframe = page.getByRole('region', { name: 'תשלום מאובטח' }).locator('iframe')
    const sandbox = (await iframe.getAttribute('sandbox')) ?? ''

    // allow-same-origin is required (the hosted page needs its own storage);
    // allow-top-navigation must NOT be, or the framed page could redirect the
    // whole tab anywhere it liked.
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).toContain('allow-same-origin')
    expect(sandbox).not.toContain('allow-top-navigation')
  })

  test('the shopper is told who is charging them', async ({ page }) => {
    await pressPayForCouponFixture(page)

    const frame = page.getByRole('region', { name: 'תשלום מאובטח' })
    await expect(frame.getByText(/החיוב מתבצע מול Cardcom/)).toBeVisible()
    await expect(frame.locator('iframe')).toHaveAttribute('title', 'דף תשלום מאובטח של Cardcom')
  })
})
