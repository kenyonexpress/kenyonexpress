import type { Coupon } from '@/components/CouponCard'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getHotCouponDeals = vi.hoisted(() => vi.fn())
vi.mock('@/lib/homepage/below-fold', () => ({ getHotCouponDeals }))

// The ticket is pinned in CouponCard.test.tsx; the section's own markup is
// what is under test, so the card renders its id.
vi.mock('@/components/CouponCard', () => ({
  default: ({ coupon }: { coupon: Coupon }) => <article data-coupon-card={coupon.id} />,
}))

import HotCoupons from './HotCoupons'

const deal = (i: number): Coupon => ({
  id: `deal-${i}`,
  title_he: `דיל ${i}`,
  business_name: 'עסק',
  original_price: 100,
  platform_price: 10,
  discount_percentage: 90,
  location_he: null,
  image_url: null,
})

beforeEach(() => {
  getHotCouponDeals.mockReset()
})

/**
 * UX10: the section mounts the ticket grid (`.hot-coupons__grid`, 1 / 2 / 4
 * columns at 0 / 768 / 1200 with one row height, globals.css) where a
 * Tailwind 2 / 4 grid was. The heading row is unchanged.
 */
describe('HotCoupons', () => {
  it('renders nothing when the catalogue has no hot coupon', async () => {
    getHotCouponDeals.mockResolvedValue([])
    expect(renderToStaticMarkup(await HotCoupons())).toBe('')
  })

  it('renders the heading row and one ticket per deal in the ticket grid', async () => {
    getHotCouponDeals.mockResolvedValue([1, 2, 3].map(deal))
    const html = renderToStaticMarkup(await HotCoupons())
    expect(html).toMatch(/<section aria-labelledby="hot-coupons-title" dir="rtl"/)
    expect(html).toContain('<h2 id="hot-coupons-title"')
    expect(html).toContain('קופונים חמים')
    expect(html).toMatch(/<a[^>]*href="\/coupons"[^>]*>לכל הקופונים/)
    expect(html).toMatch(/<div class="hot-coupons__grid" data-hot-coupons-grid[^>]*>/)
    expect(html).not.toContain('grid-cols-')
    expect(html.match(/data-coupon-card="deal-\d"/g)).toEqual([
      'data-coupon-card="deal-1"',
      'data-coupon-card="deal-2"',
      'data-coupon-card="deal-3"',
    ])
  })
})
