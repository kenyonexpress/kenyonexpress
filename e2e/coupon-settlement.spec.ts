import { expect, test } from '@playwright/test'
import { paidFlowEnabled } from './auth-session'
import { FIXTURE_SLUGS, db, dbEnabled, escrowHoldCountForOrder, vouchersForOrderItem } from './db'
import { completeMockPayment, fixtureIsPurchasable, pressPayForCouponFixture } from './pay'

/**
 * WHAT A PAID COUPON WRITES, AND WHY IT IS NOT AN ESCROW HOLD.
 *
 * This gate was specified as "coupon purchase creates escrow record". It does
 * not, and asserting that it does would pin a model this project deliberately
 * left. The escrow model -- platform holds the supplier's share of the
 * prepayment from payment until the counter scan -- was reversed by Ofir on
 * 2026-07-28. Three artefacts say so and agree:
 *
 *   - 081_payout_no_escrow.sql supersedes 079_payout_escrow_release.sql and
 *     records the coupon payout line as CANCELLED, "there is nothing for us to
 *     pay out".
 *   - 085_voucher_scan_audit_and_no_escrow.sql strips the release branch out of
 *     redeem_voucher(), noting that `WHERE status = 'held'` had been matching
 *     nothing because no voucher hold is ever written.
 *   - src/server/payments/finalize.ts writes no escrow_holds row at all. The
 *     coupon line goes straight to settlement_status = 'split_executed'.
 *
 * A spec demanding an escrow row would therefore fail for the one reason a test
 * must never fail: the system is right and the test is out of date. This file
 * pins the record a coupon purchase DOES create, and asserts the absence of the
 * escrow row as an explicit invariant rather than by silence -- because the
 * `escrow_holds` table still exists, its RLS policies still exist, and a future
 * change that quietly started writing to it again would otherwise reintroduce
 * the abolished model with nothing red.
 *
 * The money assertions come from the fixture, whose numbers are fixed by
 * scripts/seed-test-data.mjs: face value 400 ILS, coupon price 40 ILS on site,
 * platform_percent 10. So the on-site charge is 4000 agorot, the platform keeps
 * 400, the supplier is due 3600, and 36000 is collected in cash at the counter
 * and never passes through us.
 */

const FIXTURE = {
  faceValueAgorot: 40_000,
  paidOnSiteAgorot: 4_000,
  platformPercent: 10,
  commissionAgorot: 400,
  balanceDueAgorot: 36_000,
} as const

test.describe('a paid coupon order writes its settlement @checkout @money', () => {
  test.describe.configure({ timeout: 180_000 })
  // Serial: these specs pay for real fixture orders against a shared database,
  // and the reads below resolve "the order this test just created" by id, so
  // two of them racing would still be correct but would burn fixture stock and
  // Cardcom mock sequence numbers for no extra coverage.
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
    test.skip(!dbEnabled(), 'no service key in the environment; settlement rows unreadable')
    test.skip(
      !(await fixtureIsPurchasable(page, FIXTURE_SLUGS.coupon)),
      'e2e-test-coupon is not purchasable; run pnpm seed:test',
    )
  })

  test('the coupon line settles as split_executed, with a voucher and no escrow hold', async ({
    page,
  }) => {
    await pressPayForCouponFixture(page)
    const orderId = await completeMockPayment(page)

    const { data: items } = await db()
      .from('order_items')
      .select(
        'id, product_type, settlement_status, item_status, platform_percent, paid_on_site_agorot, commission_agorot, balance_due_agorot, face_value_agorot',
      )
      .eq('order_id', orderId)

    const coupon = (items ?? []).find((item) => item.product_type === 'coupon')
    expect(coupon, `order ${orderId} has no coupon line`).toBeTruthy()
    if (!coupon) return

    // The line is settled at payment. Nothing is deferred, so there is no
    // later transition for a scan to make.
    expect(coupon.settlement_status).toBe('split_executed')
    expect(coupon.item_status).toBe('issued')

    // Exactly one voucher per purchased unit, and it is the thing the customer
    // takes to the counter.
    const vouchers = await vouchersForOrderItem(coupon.id)
    expect(vouchers.length).toBe(1)
    expect(vouchers[0]?.code).toMatch(/^[0-9A-Z]{10}$/)
    expect(vouchers[0]?.status).toBe('issued')

    // The invariant that replaced escrow. Not silence: an explicit zero.
    expect(
      await escrowHoldCountForOrder(orderId),
      'an escrow hold was written; the escrow model was abolished on 2026-07-28 (see 081, 085)',
    ).toBe(0)
  })

  test('the money snapshot is the product percent applied to the prepayment only', async ({
    page,
  }) => {
    await pressPayForCouponFixture(page)
    const orderId = await completeMockPayment(page)

    const { data: items } = await db()
      .from('order_items')
      .select(
        'product_type, platform_percent, paid_on_site_agorot, commission_agorot, balance_due_agorot, face_value_agorot',
      )
      .eq('order_id', orderId)

    const coupon = (items ?? []).find((item) => item.product_type === 'coupon')
    expect(coupon).toBeTruthy()
    if (!coupon) return

    // Snapshotted at order time and immutable afterwards (C10). The percent on
    // the line is the product's own, not a constant: there is no default
    // commission anywhere in this project.
    expect(Number(coupon.platform_percent)).toBe(FIXTURE.platformPercent)

    expect(coupon.face_value_agorot).toBe(FIXTURE.faceValueAgorot)
    expect(coupon.paid_on_site_agorot).toBe(FIXTURE.paidOnSiteAgorot)

    // The split base is the PREPAYMENT, never the face value. Charging the
    // percent on the sticker price would bill the supplier for the 360 ILS the
    // customer hands over at their own counter, which never reaches us.
    expect(coupon.commission_agorot).toBe(FIXTURE.commissionAgorot)
    expect(coupon.balance_due_agorot).toBe(FIXTURE.balanceDueAgorot)

    // Conservation, stated as arithmetic rather than as three separate numbers:
    // what the customer paid is what the two parties split, and the face value
    // is the prepayment plus what is still owed at the counter.
    expect((coupon.face_value_agorot ?? 0) - (coupon.paid_on_site_agorot ?? 0)).toBe(
      coupon.balance_due_agorot,
    )
  })

  test('the escrow table stays empty for the fixture customer, order after order', async () => {
    // Reads across every order the fixture customer has ever paid for rather
    // than only the one this file just made. A regression that started writing
    // holds again would show up on the FIRST such order, and the specs above
    // each look at their own; this one looks at all of them.
    const { data: profile } = await db()
      .from('profiles')
      .select('id')
      .eq('email', process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local')
      .maybeSingle()
    test.skip(!profile, 'fixture customer missing; run pnpm seed:test')
    if (!profile) return

    const { data: orders } = await db()
      .from('orders')
      .select('id')
      .eq('user_id', profile.id)
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(20)

    test.skip((orders ?? []).length === 0, 'fixture customer has no paid orders yet')

    for (const order of orders ?? []) {
      expect(
        await escrowHoldCountForOrder(order.id),
        `order ${order.id} carries an escrow hold under a model that has none`,
      ).toBe(0)
    }
  })
})
