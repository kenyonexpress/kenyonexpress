import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const addToCart = vi.fn(async () => {})
const push = vi.fn()

/**
 * Both stubs exist for import chains, not for convenience. The real
 * `CartProvider` reaches `lib/growth/client` -> `server-only`, which vitest
 * cannot resolve (same reason `ProductDealCard.test.tsx` stubs the cart), and
 * `next/navigation` has no router outside an app render.
 */
vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart, isPending: false }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import MobileStickyBar from './MobileStickyBar'

/** Captures the observer so a test can drive the intersection by hand. */
let trigger: ((entries: { isIntersecting: boolean }[]) => void) | null = null

beforeEach(() => {
  trigger = null
  addToCart.mockClear()
  push.mockClear()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        trigger = cb
      }
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  // `cleanup` only unmounts what `render` mounted. The `.pdp-buy` row these
  // tests append by hand is on `document.body`, and leaving it there makes the
  // next test observe a row it never created.
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

/** Drives the observer inside `act`, so React flushes the state it sets. */
function intersect(isIntersecting: boolean) {
  act(() => trigger?.([{ isIntersecting }]))
}

const base = {
  productId: 'p1',
  productName: 'מוצר',
  priceIls: 80,
  fullPriceIls: 200,
  hasVariants: false,
  outOfStock: false,
  isCoupon: true,
}

/** The `.pdp-buy` row the bar watches, as ProductInfo renders it. */
function withBuyRow() {
  const row = document.createElement('div')
  row.className = 'pdp-buy'
  document.body.appendChild(row)
}

describe('<MobileStickyBar>', () => {
  it('starts hidden and unfocusable while the buy row is on screen', () => {
    withBuyRow()
    const { container } = render(<MobileStickyBar {...base} />)

    intersect(true)
    expect(container.querySelector('section')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { hidden: true })).toHaveAttribute('tabindex', '-1')
  })

  it('appears once the buy row scrolls away', () => {
    withBuyRow()
    const { container } = render(<MobileStickyBar {...base} />)

    intersect(false)
    expect(container.querySelector('section')).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0')
  })

  it('is hidden below the md breakpoint only', () => {
    withBuyRow()
    const { container } = render(<MobileStickyBar {...base} />)
    expect(container.querySelector('section')?.className).toContain('md:hidden')
  })

  it('adds to the cart and heads to checkout when there is nothing to choose', async () => {
    withBuyRow()
    render(<MobileStickyBar {...base} />)
    intersect(false)

    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/checkout'))
    expect(addToCart).toHaveBeenCalledWith('p1', null, 1, 'מוצר')
  })

  it('sends a shopper back to the selector instead of guessing a variant', async () => {
    withBuyRow()
    const summary = document.createElement('div')
    summary.setAttribute('data-pdp', 'summary')
    summary.scrollIntoView = vi.fn()
    document.body.appendChild(summary)

    render(<MobileStickyBar {...base} hasVariants />)
    intersect(false)

    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('בחירת גרסה')
    fireEvent.click(button)
    await vi.waitFor(() => expect(summary.scrollIntoView).toHaveBeenCalled())
    expect(addToCart).not.toHaveBeenCalled()
  })

  it('refuses the sale for an out-of-stock coupon', () => {
    withBuyRow()
    render(<MobileStickyBar {...base} outOfStock />)
    intersect(false)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('הדיל נסגר')
  })

  it('refuses the sale for a coupon with no admin-set price', () => {
    withBuyRow()
    render(<MobileStickyBar {...base} sellable={false} />)
    intersect(false)

    expect(screen.getByRole('button')).toHaveTextContent('לא זמין לרכישה')
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('falls back to a scroll threshold when the page has no buy row', () => {
    const { container } = render(<MobileStickyBar {...base} />)
    expect(trigger).toBeNull()

    act(() => {
      window.scrollY = 900
      window.dispatchEvent(new Event('scroll'))
    })
    expect(container.querySelector('section')).toHaveAttribute('aria-hidden', 'false')
  })
})
