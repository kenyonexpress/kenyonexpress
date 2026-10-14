import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CartPageSkeleton, { CART_LOADING_LABEL } from './CartPageSkeleton'

/**
 * UX27: the cart page before the server has said what is in the cart. The
 * yellow empty banner used to stand here for 1.5-2.0s; this is the page's own
 * grid instead, on the real classes, with as many rows as the device's mirror
 * says, capped.
 */
describe('CartPageSkeleton', () => {
  it('is a busy region with one hidden sentence; every bar is decorative', () => {
    render(<CartPageSkeleton lines={2} />)
    const region = document.querySelector('[data-cart-skeleton]')
    expect(region).not.toBeNull()
    expect(region?.getAttribute('aria-busy')).toBe('true')
    expect(region).toHaveClass('cart-page__grid')
    expect(screen.getByText(CART_LOADING_LABEL)).toHaveClass('sr-only')
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    for (const bar of document.querySelectorAll('.ke-skeleton')) {
      expect(bar.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('draws the items frame with one row per line in the real row grid, and the totals column', () => {
    render(<CartPageSkeleton lines={2} />)
    const rows = document.querySelectorAll('.cart-page__items .cart-line')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.querySelector('.cart-line__thumb.ke-skeleton')).not.toBeNull()
      expect(row.querySelector('.cart-line__body .cart-pending__name')).not.toBeNull()
      expect(row.querySelector('.cart-line__footer .cart-pending__qty')).not.toBeNull()
    }
    const aside = document.querySelector('aside.cart-sidebar')
    expect(aside).not.toBeNull()
    expect(aside?.querySelector('.cart-sidebar__title .ke-skeleton')).not.toBeNull()
    expect(aside?.querySelectorAll('.cart-sidebar__rows .ke-skeleton')).toHaveLength(3)
    expect(aside?.querySelector('.cart-pending__button')).not.toBeNull()
  })

  it('never draws fewer than one row or more than three, whatever the mirror says', () => {
    const { unmount } = render(<CartPageSkeleton lines={0} />)
    expect(document.querySelectorAll('.cart-line')).toHaveLength(1)
    unmount()
    render(<CartPageSkeleton lines={20} />)
    expect(document.querySelectorAll('.cart-line')).toHaveLength(3)
  })
})
