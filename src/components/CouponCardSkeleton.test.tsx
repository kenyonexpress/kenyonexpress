import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COUPONS_LOADING_LABEL, CouponsGridSkeleton } from './CouponCardSkeleton'

/**
 * The coupon archive's streaming fallback. A role-less div may not carry
 * `aria-label` (axe `aria-prohibited-attr`, caught once on /coupons when the
 * scan ran before the grid streamed, 15.10.2026), so the accessible surface
 * is `aria-busy` plus one hidden sentence, and every ticket is decorative.
 */
describe('CouponsGridSkeleton', () => {
  it('is a busy grid with one hidden sentence and no aria-label on the div', () => {
    render(<CouponsGridSkeleton count={3} />)
    const grid = document.querySelector('[aria-busy="true"]')
    expect(grid).not.toBeNull()
    expect(grid?.hasAttribute('aria-label')).toBe(false)
    expect(grid?.hasAttribute('role')).toBe(false)
    expect(screen.getByText(COUPONS_LOADING_LABEL)).toHaveClass('sr-only')
    expect(document.querySelectorAll('.coupon-ticket')).toHaveLength(3)
    for (const ticket of document.querySelectorAll('.coupon-ticket')) {
      expect(ticket.getAttribute('aria-hidden')).toBe('true')
    }
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
