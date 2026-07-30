import {
  __resetMoneyGenerationCache,
  buildOrderItemMoneyRow,
  buildOrderMoneyRow,
  resolveOrderGeneration,
  resolveOrderItemGeneration,
} from '@/lib/commerce/order-money-columns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The columns below are the hosted project's real ones, read from
 * information_schema on 2026-07-31. They are hard-coded here on purpose: the
 * test that matters is "every column this code writes exists in the database it
 * writes to", and that cannot be asserted against a schema nobody wrote down.
 *
 * If production is migrated, these lists change in the same commit as the code,
 * which is exactly the review this project has been missing: the previous
 * literal named fourteen columns that had never existed here, and the INSERT
 * failed with 42703 before a single order could be created.
 */
const ORDERS_COLUMNS = new Set([
  'accepted_terms_at',
  'address_id',
  'affiliate_code',
  'cardcom_payment_id',
  'cashback_applied_ils',
  'created_at',
  'currency',
  'deleted_at',
  'discount_ils',
  'expires_at',
  'id',
  'invoice_number',
  'notes',
  'paid_at',
  'referral_code_used',
  'status',
  'subtotal_ils',
  'total_ils',
  'updated_at',
  'user_id',
])

const ORDER_ITEMS_COLUMNS = new Set([
  'balance_due_agorot',
  'cashback_amount_agorot',
  'cashback_earned_ils',
  'cashback_percent',
  'commission_agorot',
  'commission_percent',
  'commission_percent_snapshot',
  'coupon_price_ils',
  'created_at',
  'deleted_at',
  'discount_percent',
  'escrow_held_agorot',
  'escrow_release_agorot',
  'face_value_agorot',
  'fulfilled_at',
  'id',
  'item_status',
  'order_id',
  'paid_on_site_agorot',
  'platform_percent',
  'product_id',
  'product_type',
  'quantity',
  'settlement_status',
  'supplier_address',
  'supplier_id',
  'supplier_immediate_agorot',
  'supplier_logo_url',
  'supplier_name',
  'supplier_payout_ils',
  'supplier_phone',
  'total_price_ils',
  'unit_price_ils',
  'updated_at',
  'upfront_percent',
  'variant_id',
])

/** NOT NULL with no default: omitting one fails the insert as surely as naming a missing column. */
const ORDERS_REQUIRED = ['subtotal_ils', 'total_ils']

const ORDER_MONEY = {
  faceValueAgorot: 21990,
  discountAgorot: 1000,
  walletAppliedAgorot: 500,
  paidOnSiteAgorot: 20490,
}

const ITEM_MONEY = {
  unitPriceAgorot: 21990,
  faceValueAgorot: 43980,
  paidOnSiteAgorot: 4398,
  commissionAgorot: 4398,
  supplierDueAgorot: 0,
  balanceDueAgorot: 39582,
  cashbackAgorot: 220,
  platformBasisPoints: 10000,
}

beforeEach(() => {
  __resetMoneyGenerationCache()
})

describe('orders row', () => {
  it('writes only columns the hosted project has', () => {
    for (const column of Object.keys(buildOrderMoneyRow('ils', ORDER_MONEY))) {
      expect(ORDERS_COLUMNS.has(column), `orders has no column ${column}`).toBe(true)
    }
  })

  it('writes every NOT NULL column that has no default', () => {
    const row = buildOrderMoneyRow('ils', ORDER_MONEY)
    for (const column of ORDERS_REQUIRED) {
      expect(row[column], `orders.${column} is NOT NULL with no default`).toBeTypeOf('number')
    }
  })

  it('converts agorot to shekels', () => {
    expect(buildOrderMoneyRow('ils', ORDER_MONEY)).toEqual({
      subtotal_ils: 219.9,
      discount_ils: 10,
      cashback_applied_ils: 5,
      total_ils: 204.9,
    })
  })

  // There is no customer_pays_now column on this schema: the total IS what the
  // card is charged, and the wallet spend rides on cashback_applied_ils.
  it('puts the charged amount in total_ils, not the face value', () => {
    const row = buildOrderMoneyRow('ils', ORDER_MONEY)
    expect(row.total_ils).toBe(204.9)
    expect(row.subtotal_ils).toBe(219.9)
  })

  it('keeps the post-059 row exactly as it was', () => {
    expect(buildOrderMoneyRow('agorot', ORDER_MONEY)).toEqual({
      subtotal_agorot: 21990,
      discount_agorot: 1000,
      wallet_applied_agorot: 500,
      cashback_applied_agorot: 500,
      customer_pays_now_agorot: 20490,
      total_agorot: 20490,
    })
  })
})

describe('order_items row', () => {
  it('writes only columns the hosted project has', () => {
    for (const column of Object.keys(buildOrderItemMoneyRow('ils', ITEM_MONEY))) {
      expect(ORDER_ITEMS_COLUMNS.has(column), `order_items has no column ${column}`).toBe(true)
    }
  })

  // The table is a hybrid: 070 added agorot columns to a table whose original
  // money columns are still shekels and whose rates are still whole percents.
  it('keeps agorot where 070 put agorot and shekels where the original columns are', () => {
    const row = buildOrderItemMoneyRow('ils', ITEM_MONEY)
    expect(row.face_value_agorot).toBe(43980)
    expect(row.paid_on_site_agorot).toBe(4398)
    expect(row.commission_agorot).toBe(4398)
    expect(row.balance_due_agorot).toBe(39582)
    expect(row.unit_price_ils).toBe(219.9)
    expect(row.total_price_ils).toBe(439.8)
    expect(row.supplier_payout_ils).toBe(0)
    expect(row.cashback_earned_ils).toBe(2.2)
  })

  it('writes rates as whole percents, not basis points', () => {
    const row = buildOrderItemMoneyRow('ils', ITEM_MONEY)
    // 10000 bp is 100%: the platform takes the whole coupon prepayment.
    expect(row.platform_percent).toBe(100)
    expect(row.commission_percent).toBe(100)
    expect(row.upfront_percent).toBe(100)
    expect(row.commission_percent_snapshot).toBe(100)
  })

  it('writes a fractional rate without losing it', () => {
    const row = buildOrderItemMoneyRow('ils', { ...ITEM_MONEY, platformBasisPoints: 1250 })
    expect(row.platform_percent).toBe(12.5)
  })

  it('writes one column per number, never several spellings of it', () => {
    const row = buildOrderItemMoneyRow('ils', ITEM_MONEY)
    const commissionColumns = Object.keys(row).filter(
      (c) => row[c] === ITEM_MONEY.commissionAgorot && c.endsWith('_agorot'),
    )
    // paid_on_site and commission happen to be equal on a full-prepay coupon,
    // so the assertion is on the alias that does not exist rather than a count.
    expect(row.platform_fee_agorot).toBeUndefined()
    expect(row.supplier_due_agorot).toBeUndefined()
    expect(row.charged_on_site_agorot).toBeUndefined()
    expect(commissionColumns.length).toBeGreaterThan(0)
  })

  it('zeroes the abolished escrow columns rather than leaving them NULL', () => {
    const row = buildOrderItemMoneyRow('ils', ITEM_MONEY)
    expect(row.escrow_held_agorot).toBe(0)
    expect(row.escrow_release_agorot).toBe(0)
  })

  it('keeps the post-059 row exactly as it was', () => {
    const row = buildOrderItemMoneyRow('agorot', ITEM_MONEY)
    expect(row.platform_bp).toBe(10000)
    expect(row.unit_price_agorot).toBe(21990)
    expect(row.supplier_due_agorot).toBe(0)
    expect(row.cashback_bp).toBe(0)
  })
})

describe('generation resolution', () => {
  const missing = { error: { code: '42703', message: 'no column' } }

  it('reads a database that has the sentinel as post-059', async () => {
    const probe = vi.fn().mockResolvedValue({ error: null })
    expect(await resolveOrderGeneration(probe)).toBe('agorot')
    expect(probe).toHaveBeenCalledWith('total_agorot')
  })

  it('reads a database without the sentinel as pre-059', async () => {
    expect(await resolveOrderGeneration(vi.fn().mockResolvedValue(missing))).toBe('ils')
  })

  it('uses a different sentinel for order_items', async () => {
    const probe = vi.fn().mockResolvedValue(missing)
    expect(await resolveOrderItemGeneration(probe)).toBe('ils')
    expect(probe).toHaveBeenCalledWith('platform_bp')
  })

  it('probes once per table per process', async () => {
    const probe = vi.fn().mockResolvedValue(missing)
    await resolveOrderGeneration(probe)
    await resolveOrderGeneration(probe)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('caches the two tables independently', async () => {
    const orders = vi.fn().mockResolvedValue({ error: null })
    const items = vi.fn().mockResolvedValue(missing)
    expect(await resolveOrderGeneration(orders)).toBe('agorot')
    expect(await resolveOrderItemGeneration(items)).toBe('ils')
  })

  it('does not cache an answer derived from an unrelated failure', async () => {
    const down = vi.fn().mockResolvedValue({ error: { code: '57P01', message: 'shutdown' } })
    expect(await resolveOrderGeneration(down)).toBe('agorot')
    const real = vi.fn().mockResolvedValue(missing)
    expect(await resolveOrderGeneration(real)).toBe('ils')
  })

  it('does not cache when the probe throws', async () => {
    const thrower = vi.fn().mockRejectedValue(new Error('network'))
    expect(await resolveOrderGeneration(thrower)).toBe('agorot')
    const real = vi.fn().mockResolvedValue(missing)
    expect(await resolveOrderGeneration(real)).toBe('ils')
  })
})
