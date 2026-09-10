import { describe, expect, it } from 'vitest'
import { buildCleanSql, buildSql } from './seed-lifecycle.mjs'
import { ORDERS, PAYMENTS, VOUCHERS, itemIdFor, seededIds } from './seed/lifecycle-data.mjs'

/**
 * THE SEED HAS TO COVER EVERY STATE, AND THE STATES ARE NOT A LIST THIS FILE
 * INVENTED.
 *
 * Read off production with `pg_enum` on 2026-09-10. When somebody adds a status,
 * this test is what makes the seed grow with it instead of leaving one screen
 * with no fixture and nobody noticing until that screen is opened.
 *
 * The generated SQL itself was proven against production the same day, inside a
 * DO block that inserted all 28 rows and then raised to roll itself back:
 * `ROLLBACK PROBE OK: orders=8 items=8 payments=7 vouchers=5`, and a re-read
 * confirmed zero rows left behind. That probe is what found the defect this file
 * cannot see: six of the columns the first draft inserted are GENERATED, and
 * Postgres refuses a value for them.
 */

const ORDER_STATUSES = [
  'pending',
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'cancelled',
  'refunded',
  'platform_settled',
]
const PAYMENT_STATUSES = [
  'initiated',
  'redirected',
  'succeeded',
  'failed',
  'refunded',
  'platform_settled',
]
const VOUCHER_STATUSES = ['issued', 'redeemed', 'expired', 'cancelled', 'refunded']

/** `vouchers_code_format`, verbatim from the live constraint. */
const CODE_FORMAT = /^[0-9A-HJKMNP-TV-Z]{10}$/

describe('the lifecycle seed covers every state', () => {
  it('has an order in every order_status', () => {
    expect([...new Set(ORDERS.map((order) => order.status))].sort()).toEqual(
      [...ORDER_STATUSES].sort(),
    )
  })

  it('has a payment in every payment_status', () => {
    expect([...new Set(PAYMENTS.map((payment) => payment.status))].sort()).toEqual(
      [...PAYMENT_STATUSES].sort(),
    )
  })

  it('has a voucher in every voucher_status', () => {
    expect(VOUCHERS.map((voucher) => voucher.status).sort()).toEqual([...VOUCHER_STATUSES].sort())
  })
})

describe('the money satisfies the live constraints', () => {
  it('conserves the voucher identity face = online + balance', () => {
    // vouchers_conservation. A rounded percentage here is a row Postgres refuses.
    const sql = buildSql()
    const rows = [...sql.matchAll(/40000, (\d+), (\d+), 10,/g)]
    expect(rows.length).toBe(VOUCHERS.length)
    for (const [, online, balance] of rows) {
      expect(Number(online) + Number(balance)).toBe(40_000)
    }
  })

  it('conserves the item identity face = paid_on_site + balance_due', () => {
    // order_items_money_conservation, on the coupon rows only: a physical item
    // has no face value and the constraint passes on NULL.
    const coupons = ORDERS.filter((order) => order.item.kind === 'coupon')
    expect(coupons.length).toBeGreaterThan(0)
    const sql = buildSql()
    const rows = [...sql.matchAll(/10, 90, 40000, (\d+), (\d+),/g)]
    expect(rows.length).toBe(coupons.length)
    for (const [, paid, due] of rows) expect(Number(paid) + Number(due)).toBe(40_000)
  })

  it('splits platform and supplier to exactly 100', () => {
    // order_items_split_pair_sums_to_100.
    for (const [, platform, supplier] of buildSql().matchAll(
      /::settlement_status, (\d+), (\d+),/g,
    )) {
      expect(Number(platform) + Number(supplier)).toBe(100)
    }
  })

  it('writes no generated column, which production refuses', () => {
    const sql = buildSql()
    for (const generated of [
      'subtotal_ils_agorot',
      'total_ils_agorot',
      'unit_price_ils_agorot',
      'total_price_ils_agorot',
      'supplier_payout_ils_agorot',
      'amount_ils_agorot',
      'cashback_applied_ils_agorot',
    ]) {
      expect(sql, `${generated} is GENERATED; inserting it fails with 428C9`).not.toContain(
        generated,
      )
    }
    // And the ones that are NOT generated are still written: vouchers is
    // agorot-native, so dropping these would lose the money entirely.
    expect(sql).toContain('face_value_agorot')
    expect(sql).toContain('remaining_amount_due_agorot')
  })
})

describe('the voucher codes are codes the database accepts', () => {
  it('matches vouchers_code_format', () => {
    for (const voucher of VOUCHERS) expect(voucher.code).toMatch(CODE_FORMAT)
  })

  it('uses no character a person misreads at a counter', () => {
    // I, L, O and U are absent from the alphabet on purpose.
    for (const voucher of VOUCHERS) expect(voucher.code).not.toMatch(/[ILOU]/)
  })

  it('gives every voucher its own code', () => {
    const codes = VOUCHERS.map((voucher) => voucher.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('the emitted SQL', () => {
  const sql = buildSql()

  it('inserts nothing without the fixtures, and says which script makes them', () => {
    expect(sql).toContain('RAISE EXCEPTION')
    expect(sql).toContain('scripts/seed-test-data.mjs')
  })

  it('is idempotent by DO NOTHING rather than DO UPDATE', () => {
    // Every status guard on these tables is BEFORE UPDATE, so a DO UPDATE re-run
    // would be judged as a status transition and could be refused. A seed whose
    // second run can fail is not idempotent.
    // Statements only: the header comment explains why DO UPDATE is wrong here,
    // and a test that failed on its own explanation would be a test people delete.
    const statements = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(statements).not.toContain('DO UPDATE')
    expect(statements.match(/ON CONFLICT \(id\) DO NOTHING/g) ?? []).toHaveLength(4)
  })

  it('cleans up exactly what it creates, children before parents', () => {
    const clean = buildCleanSql()
    const ids = seededIds()
    for (const id of [...ids.orders, ...ids.orderItems, ...ids.payments, ...ids.vouchers]) {
      expect(clean).toContain(id)
    }
    expect(clean.indexOf('public.vouchers')).toBeLessThan(clean.indexOf('public.order_items'))
    expect(clean.indexOf('public.order_items')).toBeLessThan(clean.indexOf('public.orders'))
  })

  it('keeps every id inside the reserved fixture namespace', () => {
    const ids = seededIds()
    for (const id of [...ids.orders, ...ids.payments, ...ids.vouchers]) {
      expect(id.startsWith('f47ac10b-58cc-4372-a567-0e02b2c3e9')).toBe(true)
    }
    for (const id of ids.orderItems) {
      expect(id.startsWith('f47ac10b-58cc-4372-a567-0e02b2c3ea')).toBe(true)
    }
  })

  it('derives an item id per order and never collides', () => {
    const items = ORDERS.map((order) => itemIdFor(order.id))
    expect(new Set(items).size).toBe(items.length)
  })

  it('attaches every voucher and payment to an order the seed creates', () => {
    const orderIds = new Set(ORDERS.map((order) => order.id))
    for (const voucher of VOUCHERS) expect(orderIds.has(voucher.orderId)).toBe(true)
    for (const payment of PAYMENTS) expect(orderIds.has(payment.orderId)).toBe(true)
  })
})
