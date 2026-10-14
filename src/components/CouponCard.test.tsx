import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The two islands are pinned in their own files; here the ticket's markup is
// under test, so each island renders the prop it was handed.
vi.mock('@/components/coupon/CopyCouponCode', () => ({
  default: ({ code }: { code: string }) => (
    <button type="button" data-copy-code>
      {code}
    </button>
  ),
}))
vi.mock('@/components/coupon/CouponCountdown', () => ({
  default: ({ validUntilIso }: { validUntilIso: string }) => (
    <p data-coupon-countdown data-until={validUntilIso} />
  ),
}))

import CouponCard, { type Coupon, couponDiscountPercent } from './CouponCard'

const DEAL: Coupon = {
  id: 'b787a850-e9e5-4d6a-951c-d9dc18ced87f',
  title_he: 'עיסוי שוודי מפנק 60 דקות',
  business_name: 'ספא נירוונה',
  original_price: 320,
  platform_price: 32,
  discount_percentage: 90,
  location_he: 'תל אביב',
  image_url: null,
  valid_until: null,
}

const html = (coupon: Coupon) => renderToStaticMarkup(<CouponCard coupon={coupon} />)

/**
 * UX10: the coupon deal as a ticket. Before this the card was one `<a>` with
 * a 128px image band and a 25px-radius chip (logs/ux10/before.json); now it
 * is an article with a stub, a body and a footer whose two affordances mount
 * only on the data that justifies them.
 */
describe('CouponCard (UX10 ticket)', () => {
  it('is an article, not a link: the title is the link to the deal', () => {
    const out = html(DEAL)
    expect(out).toMatch(/^<article class="coupon-ticket" data-coupon-card/)
    expect(out.match(/<a /g)).toHaveLength(2) // the title and the details link
    expect(out).toMatch(
      /<h3 class="coupon-ticket__title" data-coupon-title[^>]*><a[^>]*href="\/coupons\/b787a850-e9e5-4d6a-951c-d9dc18ced87f"[^>]*>עיסוי שוודי מפנק 60 דקות<\/a><\/h3>/,
    )
  })

  it('carries the percentage on the stub as a plain number over "הנחה"', () => {
    const out = html(DEAL)
    expect(out).toMatch(
      /<div class="coupon-ticket__stub" data-coupon-stub[^>]*><span class="coupon-ticket__pct" data-coupon-badge[^>]*>90%<\/span><span class="coupon-ticket__pct-label">הנחה<\/span><\/div>/,
    )
    expect(out).not.toContain('-90%')
    expect(out).not.toContain('90% הנחה')
  })

  it('shows the business, the location, the price split and the balance line', () => {
    const out = html(DEAL)
    expect(out).toContain('data-coupon-business')
    expect(out).toContain('ספא נירוונה')
    expect(out).toContain('תל אביב')
    expect(out).toMatch(/data-coupon-price[^>]*>[^<]*32[^<]*₪/)
    expect(out).toMatch(/coupon-ticket__was[^>]*>[^<]*320[^<]*₪/)
    expect(out).toContain('באתר, היתרה בבית העסק')
  })

  it('advertises no number and no split for a deal with no price', () => {
    const out = html({ ...DEAL, platform_price: null, discount_percentage: null })
    expect(out).toContain('המחיר יעודכן בקרוב')
    expect(out).not.toContain('data-coupon-badge')
    expect(out).not.toContain('היתרה בבית העסק')
    expect(out).toContain('coupon-ticket__stub') // the stub stays, with the icon
    expect(out).toContain('<svg')
  })

  it('mounts the countdown only for a set, parseable valid_until', () => {
    expect(html(DEAL)).not.toContain('data-coupon-countdown')
    expect(html({ ...DEAL, valid_until: undefined })).not.toContain('data-coupon-countdown')
    expect(html({ ...DEAL, valid_until: 'soon' })).not.toContain('data-coupon-countdown')
    expect(html({ ...DEAL, valid_until: '2026-12-31T21:59:59+00:00' })).toMatch(
      /data-coupon-countdown[^>]*data-until="2026-12-31T21:59:59\+00:00"/,
    )
  })

  it('mounts the copy button for a row with a code and the details link for the rest, never both', () => {
    const without = html(DEAL)
    expect(without).toContain('data-coupon-more')
    expect(without).toContain('לפרטי הקופון')
    expect(without).not.toContain('data-copy-code')

    const withCode = html({ ...DEAL, code: 'SPA90' })
    expect(withCode).toMatch(/<button[^>]*data-copy-code[^>]*>SPA90<\/button>/)
    expect(withCode).not.toContain('data-coupon-more')

    // Blank and whitespace codes are no code.
    expect(html({ ...DEAL, code: '   ' })).toContain('data-coupon-more')
    expect(html({ ...DEAL, code: null })).toContain('data-coupon-more')
  })

  it('renders the photograph as a second, hidden link when there is one, and no band otherwise', () => {
    expect(html(DEAL)).not.toContain('data-coupon-image')
    const out = html({ ...DEAL, image_url: 'https://images.unsplash.com/spa.jpg' })
    expect(out).toMatch(
      /<a class="coupon-ticket__image" data-coupon-image[^>]*aria-hidden="true"[^>]*tabindex="-1"/,
    )
    expect(out).toMatch(/<img[^>]*alt=""/)
    expect(out.match(/<a /g)).toHaveLength(3)
  })
})

describe('couponDiscountPercent', () => {
  it('prefers the row, derives from the prices otherwise, and refuses zero and nonsense', () => {
    expect(couponDiscountPercent(DEAL)).toBe(90)
    expect(couponDiscountPercent({ ...DEAL, discount_percentage: 33.4 })).toBe(33)
    expect(couponDiscountPercent({ ...DEAL, discount_percentage: null })).toBe(90)
    expect(
      couponDiscountPercent({ discount_percentage: null, platform_price: 60, original_price: 80 }),
    ).toBe(25)
    expect(couponDiscountPercent({ ...DEAL, discount_percentage: 0 })).toBeNull()
    expect(
      couponDiscountPercent({
        discount_percentage: null,
        platform_price: null,
        original_price: 80,
      }),
    ).toBeNull()
    expect(
      couponDiscountPercent({ discount_percentage: null, platform_price: 10, original_price: 0 }),
    ).toBeNull()
    expect(
      couponDiscountPercent({ discount_percentage: null, platform_price: 90, original_price: 80 }),
    ).toBeNull()
  })
})
