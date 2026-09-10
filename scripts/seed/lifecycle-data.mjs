/**
 * ORDERS, PAYMENTS AND VOUCHERS IN EVERY STATE THE DATABASE ALLOWS.
 *
 * WHAT WAS MISSING, MEASURED 2026-09-10. `seed-catalogue.mjs` builds a catalogue
 * (14 suppliers, 40 deals) and `seed-test-data.mjs` builds the E2E fixtures (one
 * supplier, one category, two products, three users). Neither creates a single
 * ORDER. So every screen that exists to show an order in a particular state -
 * the refund queue, the expiry engine's own page, the supplier redemption list,
 * the wallet credit that follows an expiry - could only be developed against
 * production data or against nothing.
 *
 * THE STATES ARE READ OFF PRODUCTION, NOT INVENTED. Every label below came from
 * `pg_enum` on 2026-09-10:
 *
 *   order_status     pending, paid, partially_fulfilled, fulfilled, cancelled,
 *                    refunded, platform_settled
 *   payment_status   initiated, redirected, succeeded, failed, refunded,
 *                    platform_settled
 *   voucher_status   issued, redeemed, expired, cancelled, refunded
 *
 * `scripts/seed-lifecycle.test.mjs` fails if a label stops being covered, which
 * is what makes a new status somebody adds arrive with fixture data instead of a
 * blank screen.
 *
 * WHY IT INSERTS TERMINAL STATES DIRECTLY. Every status guard on these four
 * tables is `BEFORE UPDATE` - `tg_orders_status_guard`,
 * `tg_payments_status_guard`, `tg_vouchers_status_guard`, read from
 * `pg_trigger` the same day - so an INSERT may carry any status and a
 * transition is not required. That is also why the emitter uses
 * `ON CONFLICT DO NOTHING` rather than `DO UPDATE`: a re-run that UPDATEd a row
 * would be judged by those guards as a status transition, and a seed whose second
 * run can be refused is not idempotent. Re-running changes nothing; to change a
 * value, clean and re-seed.
 *
 * THE MONEY IS INTEGER AGOROT AND SATISFIES THE LIVE CONSTRAINTS. Two of them
 * are conservation identities and would reject anything approximate:
 *
 *   vouchers_conservation      face_value = coupon_price + remaining_amount_due
 *   order_items_money_conservation
 *                              face_value = paid_on_site + balance_due
 *   order_items_split_pair_sums_to_100
 *                              platform_percent + supplier_split_percent = 100
 *
 * The fixture coupon is the one `seed-test-data.mjs` already creates: 400 ILS
 * face, 40 ILS online, platform 10%. In agorot that is 40000 = 4000 + 36000.
 *
 * AND THE VOUCHER CODE IS NOT FREE TEXT. `vouchers_code_format` is
 * `^[0-9A-HJKMNP-TV-Z]{10}$` - ten characters from an alphabet with I, L, O and U
 * removed, because those are the ones a person reads back wrong over a counter.
 * Every code below is checked against that regex by the test.
 */

/** The fixtures this builds on. Created by scripts/seed-test-data.mjs. */
export const DEPENDS_ON = {
  supplier: 'f47ac10b-58cc-4372-a567-0e02b2c3d901',
  category: 'f47ac10b-58cc-4372-a567-0e02b2c3d902',
  couponProduct: 'f47ac10b-58cc-4372-a567-0e02b2c3d903',
  physicalProduct: 'f47ac10b-58cc-4372-a567-0e02b2c3d904',
  customerEmail: 'e2e-customer@test.kenyonexpress.local',
  supplierMemberEmail: 'e2e-supplier@test.kenyonexpress.local',
}

/**
 * The e-series of the fixture namespace. `seed-test-data.mjs` owns …d9xx and
 * this owns …e9xx, so the two seeds coexist, count apart and clean apart.
 */
const id = (n) => `f47ac10b-58cc-4372-a567-0e02b2c3e9${String(n).padStart(2, '0')}`

/** The coupon fixture, in agorot. 40000 = 4000 + 36000. */
const COUPON = {
  faceAgorot: 40_000,
  onlineAgorot: 4_000,
  balanceAgorot: 36_000,
  platformPercent: 10,
}

/** The physical fixture: 100 ILS paid in full online, 10% commission. */
const PHYSICAL = {
  totalAgorot: 10_000,
  commissionPercent: 10,
}

/**
 * Eight orders for seven statuses: `paid` appears twice, because a voucher can
 * only be `expired` under an order that was paid, and an order carrying both a
 * live voucher and an expired one would be a state the application never
 * produces.
 */
export const ORDERS = [
  {
    id: id(1),
    status: 'pending',
    note: 'checkout started, nothing charged',
    item: { kind: 'coupon', status: 'pending', settlement: 'pending' },
    paidAt: null,
    createdDaysAgo: 0,
  },
  {
    id: id(2),
    status: 'paid',
    note: 'charged, voucher issued, nothing redeemed yet',
    item: { kind: 'coupon', status: 'issued', settlement: 'paid' },
    paidAt: true,
    createdDaysAgo: 1,
  },
  {
    id: id(3),
    status: 'paid',
    note: 'older paid order whose voucher has since expired',
    item: { kind: 'coupon', status: 'issued', settlement: 'paid' },
    paidAt: true,
    createdDaysAgo: 200,
  },
  {
    id: id(4),
    status: 'partially_fulfilled',
    note: 'physical order shipped and not yet delivered',
    item: { kind: 'physical', status: 'shipped', settlement: 'paid' },
    paidAt: true,
    createdDaysAgo: 4,
  },
  {
    id: id(5),
    status: 'fulfilled',
    note: 'physical order delivered',
    item: { kind: 'physical', status: 'delivered', settlement: 'paid' },
    paidAt: true,
    createdDaysAgo: 10,
  },
  {
    id: id(6),
    status: 'cancelled',
    note: 'payment failed, nothing charged, voucher cancelled',
    item: { kind: 'coupon', status: 'cancelled', settlement: 'cancelled' },
    paidAt: null,
    createdDaysAgo: 6,
  },
  {
    id: id(7),
    status: 'refunded',
    note: 'charged then refunded in full, voucher refunded',
    item: { kind: 'coupon', status: 'refunded', settlement: 'refunded' },
    paidAt: true,
    createdDaysAgo: 12,
  },
  {
    id: id(8),
    status: 'platform_settled',
    note: 'coupon redeemed at the business and settled with the platform',
    item: { kind: 'coupon', status: 'issued', settlement: 'platform_settled' },
    paidAt: true,
    createdDaysAgo: 30,
  },
]

/**
 * One payment per `payment_status`, each on an order whose own status agrees with
 * it. `initiated` and `redirected` both sit on the pending order: those are the
 * two halves of a checkout that has not come back, and telling them apart is how
 * `/api/cron/stranded-payments` decides what to chase.
 */
export const PAYMENTS = [
  {
    id: id(21),
    orderId: id(1),
    status: 'initiated',
    kind: 'charge',
    amountAgorot: COUPON.onlineAgorot,
  },
  {
    id: id(22),
    orderId: id(1),
    status: 'redirected',
    kind: 'charge',
    amountAgorot: COUPON.onlineAgorot,
  },
  {
    id: id(23),
    orderId: id(2),
    status: 'succeeded',
    kind: 'charge',
    amountAgorot: COUPON.onlineAgorot,
  },
  {
    id: id(24),
    orderId: id(6),
    status: 'failed',
    kind: 'charge',
    amountAgorot: COUPON.onlineAgorot,
  },
  {
    id: id(25),
    orderId: id(7),
    status: 'refunded',
    kind: 'charge',
    amountAgorot: COUPON.onlineAgorot,
  },
  {
    id: id(26),
    orderId: id(7),
    status: 'succeeded',
    kind: 'refund',
    amountAgorot: COUPON.onlineAgorot,
    refundOf: id(25),
  },
  {
    id: id(27),
    orderId: id(8),
    status: 'platform_settled',
    kind: 'charge',
    amountAgorot: COUPON.onlineAgorot,
  },
]

/**
 * One voucher per `voucher_status`.
 *
 * `vouchers_redeemed_fields` is all-or-nothing: a `redeemed` row must carry
 * `redeemed_at`, `redeemed_by_supplier_id` AND `redeemed_by_user_id`, and any
 * other status must carry none of the three. So the redeemed one is the only row
 * with a redeemer, and `platform_settled` on the order it belongs to is what
 * says the money followed.
 */
export const VOUCHERS = [
  { id: id(41), orderId: id(2), status: 'issued', code: 'KE2AB3CD4E', expiresInDays: 60 },
  {
    id: id(42),
    orderId: id(8),
    status: 'redeemed',
    code: 'KE5FG6HJ7K',
    expiresInDays: 60,
    redeemed: true,
  },
  { id: id(43), orderId: id(3), status: 'expired', code: 'KE8MN9PQ2R', expiresInDays: -30 },
  { id: id(44), orderId: id(6), status: 'cancelled', code: 'KE3ST4VW5X', expiresInDays: 60 },
  { id: id(45), orderId: id(7), status: 'refunded', code: 'KE6YZ7AB8C', expiresInDays: 60 },
]

export const MONEY = { COUPON, PHYSICAL }

/** Every id this seed owns, for `--clean-sql` and for the count in a dry run. */
export function seededIds() {
  return {
    orders: ORDERS.map((order) => order.id),
    orderItems: ORDERS.map((order) => itemIdFor(order.id)),
    payments: PAYMENTS.map((payment) => payment.id),
    vouchers: VOUCHERS.map((voucher) => voucher.id),
  }
}

/** One item per order, id derived so the pair is readable in a query result. */
export function itemIdFor(orderId) {
  return orderId.replace(/e9(\d\d)$/, 'ea$1')
}
