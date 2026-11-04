import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agorot, ilsToAgorot } from '@/lib/commerce/money'
import { buildOrderItemMoneyRow } from '@/lib/commerce/order-money-columns'
import { describe, expect, it } from 'vitest'
import { type SettlementLineInput, calculateSettlement } from './settlement'

/**
 * S09: the split a paid order line carries is the product's split at purchase
 * time, written into order_items by checkout and frozen afterwards.
 *
 * Task names map onto the hosted columns (docs/S09-split.md):
 *   platform_percent -> platform_percent
 *   platform_amount  -> commission_agorot
 *   supplier_amount  -> supplier_immediate_agorot (+ supplier_payout_ils)
 *
 * The lock itself is proven against production in docs/S09-split.md with a
 * rolled-back DO block. This file pins the other half: every split column the
 * checkout row builder writes is one the lock in 253 refuses to change.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'migrations/pending/253_order_items_split_amount_lock.sql'),
  'utf8',
)

function lockedColumns(sql: string): Set<string> {
  return new Set([...sql.matchAll(/NEW\.(\w+) IS DISTINCT FROM OLD\.\1/g)].map((m) => m[1] ?? ''))
}

function settle(lines: SettlementLineInput[]) {
  return calculateSettlement({ idempotencyKey: 's09', lines, walletApplied: agorot(0) })
}

function rowFor(line: ReturnType<typeof settle>['lines'][number], unitPrice: number) {
  return buildOrderItemMoneyRow('ils', {
    unitPriceAgorot: unitPrice,
    faceValueAgorot: line.faceValue,
    paidOnSiteAgorot: line.paidOnSite,
    commissionAgorot: line.commission,
    supplierDueAgorot: line.supplierDue,
    balanceDueAgorot: line.balanceDueAtBusiness,
    cashbackAgorot: line.cashbackAmount,
    platformBasisPoints: line.platformPercentBps,
  })
}

describe('order_items split snapshot (S09)', () => {
  it('copies each product its own rate and splits the on-site charge in integer agorot', () => {
    const unit = ilsToAgorot('199.90')
    const result = settle([
      { id: 'a', productType: 'physical', unitPrice: unit, quantity: 3, platformPercent: 12.5 },
      { id: 'b', productType: 'physical', unitPrice: unit, quantity: 3, platformPercent: 30 },
    ])
    const [a, b] = result.lines
    if (!a || !b) throw new Error('missing settlement lines')

    const rowA = rowFor(a, unit)
    const rowB = rowFor(b, unit)

    // Same price, different products: the rate is per product, not global.
    expect(rowA.platform_percent).toBe(12.5)
    expect(rowB.platform_percent).toBe(30)

    // 3 x 199.90 = 59970 agorot. 12.5% = 7496.25 -> 7496; 30% = 17991.
    expect(rowA.commission_agorot).toBe(7496)
    expect(rowB.commission_agorot).toBe(17991)

    for (const row of [rowA, rowB]) {
      expect(Number.isInteger(row.commission_agorot)).toBe(true)
      expect(Number.isInteger(row.supplier_immediate_agorot)).toBe(true)
      // The supplier share is the residual, so the two add back exactly.
      expect((row.commission_agorot ?? 0) + (row.supplier_immediate_agorot ?? 0)).toBe(
        row.paid_on_site_agorot,
      )
    }
  })

  it('splits a coupon prepayment by the product rate, not a hardcoded 100', () => {
    const result = settle([
      {
        id: 'c',
        productType: 'coupon',
        unitPrice: ilsToAgorot('400'),
        quantity: 1,
        couponPriceUnit: ilsToAgorot('40'),
        platformPercent: 30,
      },
    ])
    const line = result.lines[0]
    if (!line) throw new Error('missing settlement line')
    const row = rowFor(line, ilsToAgorot('400'))
    expect(row.platform_percent).toBe(30)
    expect(row.commission_agorot).toBe(1200)
    expect(row.supplier_immediate_agorot).toBe(2800)
    expect(row.balance_due_agorot).toBe(36000)
  })

  it('locks every split column the checkout row writes, once the order is paid', () => {
    const locked = lockedColumns(MIGRATION)
    const required = [
      'platform_percent',
      'commission_agorot',
      'supplier_immediate_agorot',
      'supplier_payout_ils',
      'paid_on_site_agorot',
      'face_value_agorot',
      'balance_due_agorot',
      'commission_percent',
      'upfront_percent',
      'commission_percent_snapshot',
      'supplier_split_percent',
      'unit_price_ils',
      'total_price_ils',
      'quantity',
    ]
    for (const column of required) expect(locked, column).toContain(column)

    // Columns that legitimately move after payment stay writable.
    for (const column of ['settlement_status', 'item_status', 'escrow_held_agorot', 'product_id']) {
      expect(locked, column).not.toContain(column)
    }
    expect(MIGRATION).toMatch(/o\.paid_at IS NOT NULL/)
    expect(MIGRATION).toMatch(/ERRCODE = 'check_violation'/)
  })

  it('locks every money column buildOrderItemMoneyRow writes on the hosted generation', () => {
    const locked = lockedColumns(MIGRATION)
    const row = buildOrderItemMoneyRow('ils', {
      unitPriceAgorot: 1000,
      faceValueAgorot: 1000,
      paidOnSiteAgorot: 1000,
      commissionAgorot: 300,
      supplierDueAgorot: 700,
      balanceDueAgorot: 0,
      cashbackAgorot: 0,
      platformBasisPoints: 3000,
    })
    // Cashback and escrow are credited / released after payment by design.
    const exempt = new Set([
      'cashback_amount_agorot',
      'cashback_earned_ils',
      'cashback_percent',
      'escrow_held_agorot',
      'escrow_release_agorot',
    ])
    const unlocked = Object.keys(row).filter((c) => !exempt.has(c) && !locked.has(c))
    expect(unlocked).toEqual([])
  })
})
