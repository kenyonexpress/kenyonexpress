import HotCouponCard from '@/components/home/HotCouponCard'
import type { HotCoupon } from '@/lib/hot-coupons'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('HotCouponCard', () => {
  const mockCoupon = {
    id: '12345678-90ab-cdef-ghij-klmnopqrstuv',
    name_he: 'קופון מסעדה',
    price_ils: 200,
    coupon_price_ils: 50,
    coupon_expiry_days: 30,
    offer_valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    is_coupon_enabled: true,
    supplier: {
      name: 'המסעדה שלנו',
      logo_url: null,
    },
  } as unknown as HotCoupon

  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('renders coupon name', () => {
    render(<HotCouponCard coupon={mockCoupon} />)
    expect(screen.getByText('קופון מסעדה')).toBeInTheDocument()
  })

  it('renders supplier name', () => {
    render(<HotCouponCard coupon={mockCoupon} />)
    expect(screen.getByText('המסעדה שלנו')).toBeInTheDocument()
  })

  it('displays pricing information', () => {
    render(<HotCouponCard coupon={mockCoupon} />)
    expect(screen.getByText(/בחנות/)).toBeInTheDocument()
    expect(screen.getByText(/75%/)).toBeInTheDocument()
  })

  it('displays coupon code', () => {
    render(<HotCouponCard coupon={mockCoupon} />)
    expect(screen.getByText('12345678')).toBeInTheDocument()
  })

  it('renders clickable code button', () => {
    render(<HotCouponCard coupon={mockCoupon} />)
    const copyButton = screen.getByRole('button', { name: /12345678/i })
    expect(copyButton).toBeInTheDocument()
    expect(copyButton).toHaveClass('font-mono')
  })

  it('does not render if offer is not sellable', () => {
    const expiredCoupon: HotCoupon = {
      ...mockCoupon,
      offer_valid_until: new Date(Date.now() - 1000).toISOString(),
    }

    const { container } = render(<HotCouponCard coupon={expiredCoupon} />)
    expect(container.firstChild).toBeNull()
  })

  it('displays countdown timer', () => {
    render(<HotCouponCard coupon={mockCoupon} />)
    expect(screen.getByText(/תוקף:/)).toBeInTheDocument()
  })
})
