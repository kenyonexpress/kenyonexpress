import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S33: /coupons/<not-a-uuid> is a miss, not a fault.
 *
 * Measured 06.11.2026: /coupons/zzz-nope answered 500 and logged
 * coupon_deal.read_failed, because the id went to a uuid column as it was and
 * Postgres refused it (22P02). getCouponDeal now answers null for an id that
 * cannot name a row, WITHOUT asking, and the page turns null into a 404.
 */

const single = vi.fn()
const from = vi.fn(() => {
  const chain = { select: () => chain, eq: () => chain, is: () => chain, single }
  return chain
})

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/supabase/anon', () => ({ createPublicClient: () => ({ from }) }))

import { getCouponDeal } from './coupon-deals'

beforeEach(() => {
  from.mockClear()
  single.mockReset()
})

describe('getCouponDeal', () => {
  it.each(['zzz-nope', '', '123', '00000000-0000-4000-8000-00000000000', "' or 1=1 --"])(
    'answers null for %j and never reaches the database',
    async (id) => {
      expect(await getCouponDeal(id)).toBeNull()
      expect(from).not.toHaveBeenCalled()
    },
  )

  it('reads a well-formed id', async () => {
    single.mockResolvedValue({ data: { id: 'x', title_he: 'ארוחה' }, error: null })
    const deal = await getCouponDeal('00000000-0000-4000-8000-000000000000')
    expect(from).toHaveBeenCalledWith('coupon_deals')
    expect(deal).toMatchObject({ title_he: 'ארוחה' })
  })
})
