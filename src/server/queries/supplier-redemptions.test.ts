import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { getSupplierRedemptions } from './supplier'

/**
 * What a Coupon-Partner may SEE of redemptions (marathon step 12). The
 * tenant-scope scan proves the query filters by supplier_id; this pins the
 * two visibility rules the scan cannot read:
 *  - only REDEEMED vouchers surface (an issued voucher's code in a list a
 *    whole team can read is a redeemable secret on a screen), and
 *  - no customer PII crosses: customerName is null BY DESIGN, whatever the
 *    join could have fetched.
 */

type Chain = { filters: [string, unknown][]; selected: string }

function adminWith(rows: unknown[]): { chain: Chain } {
  const chain: Chain = { filters: [], selected: '' }
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: (cols: string) => {
      chain.selected = cols
      return self()
    },
    eq: (col: string, value: unknown) => {
      chain.filters.push([col, value])
      return self()
    },
    order: self,
    limit: () => Promise.resolve({ data: rows, error: null }),
  })
  createAdminClient.mockReturnValue({ from: () => builder })
  return { chain }
}

beforeEach(() => {
  createAdminClient.mockReset()
})

describe('getSupplierRedemptions visibility', () => {
  it('surfaces only redeemed vouchers of the given supplier', async () => {
    const { chain } = adminWith([])
    await getSupplierRedemptions('sup-1')
    expect(chain.filters).toContainEqual(['supplier_id', 'sup-1'])
    expect(chain.filters).toContainEqual(['status', 'redeemed'])
  })

  it('never selects or exposes customer identity', async () => {
    const { chain } = adminWith([
      {
        id: 'v-1',
        code: 'ABCDE12345',
        status: 'redeemed',
        remaining_amount_due_agorot: 14_000,
        coupon_price_agorot: 6_000,
        platform_percent: 30,
        redeemed_at: '2026-09-01T10:00:00Z',
        products: { name_he: 'ארוחה זוגית' },
      },
    ])
    const rows = await getSupplierRedemptions('sup-1')
    expect(chain.selected).not.toMatch(/user_id|profiles|email|phone/)
    expect(rows[0]).toMatchObject({
      code: 'ABCDE12345',
      productName: 'ארוחה זוגית',
      customerName: null,
    })
  })
})
