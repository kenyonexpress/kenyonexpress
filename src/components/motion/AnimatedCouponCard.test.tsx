import AnimatedCouponCard from '@/components/motion/AnimatedCouponCard'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

interface MockCouponCardProps {
  coupon?: { id?: string }
}

vi.mock('@/components/CouponCard', () => ({
  default: (props: MockCouponCardProps) => <div data-testid="coupon-card">{props.coupon?.id}</div>,
}))

const mockCoupon = {
  id: 'test-coupon-1',
  code: 'TEST123',
  discount_percent: 20,
  max_uses: 100,
  used_count: 5,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
}

describe('AnimatedCouponCard', () => {
  it('renders animated coupon card', () => {
    const { getByTestId } = render(<AnimatedCouponCard coupon={mockCoupon} />)
    expect(getByTestId('coupon-card')).toBeInTheDocument()
  })

  it('applies motion wrapper with height class', () => {
    const { container } = render(<AnimatedCouponCard coupon={mockCoupon} />)
    const heightDiv = container.querySelector('.h-full')
    expect(heightDiv).toBeInTheDocument()
  })

  it('passes coupon props to CouponCard', () => {
    const { getByTestId } = render(<AnimatedCouponCard coupon={mockCoupon} />)
    const card = getByTestId('coupon-card')
    expect(card.textContent).toContain(mockCoupon.id)
  })

  it('renders with nested motion wrapper classes', () => {
    const { container } = render(<AnimatedCouponCard coupon={mockCoupon} />)
    const heightDivs = container.querySelectorAll('.h-full')
    expect(heightDivs.length).toBeGreaterThan(0)
  })

  it('renders multiple animated coupons', () => {
    const { container } = render(
      <div>
        <AnimatedCouponCard coupon={mockCoupon} />
        <AnimatedCouponCard coupon={{ ...mockCoupon, id: 'test-coupon-2' }} />
      </div>,
    )
    const cards = container.querySelectorAll('[data-testid="coupon-card"]')
    expect(cards).toHaveLength(2)
  })
})
