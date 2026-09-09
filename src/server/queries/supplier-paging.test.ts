import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { getSupplierRedemptions, getSupplierSales } from './supplier'

/**
 * The horizon fix.
 *
 * `getSupplierSales` and `getSupplierRedemptions` used to end in `.limit(200)`
 * and `.limit(100)`, and every money figure in the supplier console is a fold
 * over the array they return -- the receivable on the payouts page, the
 * lifetime scan count on the dashboard, the till takings, the payouts CSV. A
 * capped read makes every one of those a total that silently stops growing.
 *
 * These tests pin the three things that fix depends on: that the read actually
 * pages past one batch, that reaching the ceiling is REPORTED rather than
 * silently returned as if complete, and that a failed read is distinguishable
 * from a supplier with no rows.
 */

const PAGE_SIZE = 1000

/**
 * A builder that records the `.range()` calls and serves pages from a row
 * count. Every chainable method returns the builder; `range` is the terminal.
 */
function adminServing(
  totalRows: number,
  options: { error?: { message: string; code?: string } } = {},
) {
  const ranges: Array<[number, number]> = []
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: self,
    eq: self,
    is: self,
    not: self,
    in: self,
    order: self,
    limit: self,
    range: (from: number, to: number) => {
      ranges.push([from, to])
      if (options.error) return Promise.resolve({ data: null, error: options.error })
      const size = Math.max(0, Math.min(to + 1, totalRows) - from)
      return Promise.resolve({
        data: Array.from({ length: size }, (_, index) => ({
          id: `row-${from + index}`,
          code: 'ABCDE12345',
          status: 'redeemed',
          remaining_amount_due_agorot: 100,
          coupon_price_agorot: 100,
          platform_percent: 10,
          redeemed_at: '2026-09-01T10:00:00Z',
          quantity: 1,
          order_id: 'o-1',
          supplier_immediate_agorot: 100,
          products: { name_he: 'מוצר', type: 'coupon' },
          orders: { paid_at: '2026-09-01T10:00:00Z', status: 'paid' },
        })),
        error: null,
      })
    },
  })
  createAdminClient.mockReturnValue({ from: () => builder })
  return { ranges }
}

beforeEach(() => {
  createAdminClient.mockReset()
})

describe('supplier reads page past the old limit', () => {
  it('returns every row when there are more than one page', async () => {
    // 2400 is past both retired caps (100 and 200) and past a single page.
    const { ranges } = adminServing(2_400)
    const read = await getSupplierRedemptions('sup-1')

    expect(read.rows).toHaveLength(2_400)
    expect(read.truncated).toBe(false)
    expect(read.failed).toBe(false)
    // Three requests: two full pages and a short one that ends the loop.
    expect(ranges).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ])
  })

  it('stops after one request when the first page is short', async () => {
    const { ranges } = adminServing(12)
    const read = await getSupplierSales('sup-1')
    expect(read.rows).toHaveLength(12)
    expect(ranges).toHaveLength(1)
  })

  it('makes no request past the ceiling, and says so when it gets there', async () => {
    // More rows than the ceiling admits. The read must bound itself AND report
    // that the totals folded from it are partial -- a larger silent cap would
    // be the same defect with a bigger number.
    const { ranges } = adminServing(50_000)
    const read = await getSupplierSales('sup-1')

    expect(read.truncated).toBe(true)
    expect(read.failed).toBe(false)
    expect(read.rows).toHaveLength(10_000)
    expect(ranges.at(-1)?.[1]).toBe(9_999)
  })

  it('reports a failed read as failed rather than as an empty supplier', async () => {
    // `₪0 owed` from a broken query and `₪0 owed` from a shop with no sales are
    // the same number and must not be the same answer.
    adminServing(0, { error: { message: 'connection reset', code: '08006' } })
    const read = await getSupplierSales('sup-1')

    expect(read.failed).toBe(true)
    expect(read.rows).toEqual([])
    expect(read.truncated).toBe(false)
  })

  it('stops requesting pages as soon as one errors', async () => {
    const { ranges } = adminServing(50_000, { error: { message: 'boom' } })
    await getSupplierSales('sup-1')
    expect(ranges).toHaveLength(1)
  })
})
