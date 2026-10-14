import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX15: THE BUY ROW THAT FOLLOWS THE SHOPPER.
 *
 * The sticky bar exists only while the real buy row is ABOVE the viewport:
 * not at first paint (the row is on screen or below the fold, and a bar at
 * the bottom would be a second control for the same thing), and not once
 * the shopper scrolls back up to it. jsdom has no layout and no
 * IntersectionObserver, so the suite installs one it can drive: every
 * observer callback is captured and fed an entry by hand.
 */

const addToCart = vi.hoisted(() => vi.fn(async () => true))
const push = vi.hoisted(() => vi.fn())

vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart, isPending: false }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/server/actions/reviews', () => ({
  getWishlistSaved: async () => false,
  toggleWishlist: async () => ({ ok: true, saved: true }),
}))
vi.mock('@/server/actions/stock-alerts', () => ({ joinStockWaitlist: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    throw new Error('no socket in this suite')
  },
}))

import ProductInfo from './ProductInfo'

type Callback = (entries: IntersectionObserverEntry[]) => void
const observers: { cb: Callback; target: Element | null }[] = []

class FakeObserver {
  private entry: { cb: Callback; target: Element | null }
  constructor(cb: Callback) {
    this.entry = { cb, target: null }
    observers.push(this.entry)
  }
  observe(el: Element) {
    this.entry.target = el
  }
  disconnect() {
    const i = observers.indexOf(this.entry)
    if (i >= 0) observers.splice(i, 1)
  }
  unobserve() {}
  takeRecords() {
    return []
  }
}

/** Drive the buy row's observer: above the viewport, on screen, or below the fold. */
function place(where: 'above' | 'visible' | 'below') {
  const bottom = where === 'above' ? -40 : where === 'visible' ? 500 : 1400
  act(() => {
    for (const o of observers) {
      o.cb([
        {
          isIntersecting: where === 'visible',
          boundingClientRect: { bottom, top: bottom - 53 },
          target: o.target,
        } as unknown as IntersectionObserverEntry,
      ])
    }
  })
}

const BASE = {
  productId: '11111111-1111-4111-8111-111111111111',
  name: 'תיק גב',
  nameEn: null,
  basePrice: 199,
  oldPrice: null,
  baseStock: 50,
  sku: null,
  categoryName: null,
  city: null,
  attributes: [],
  variants: [],
  isCoupon: false,
  couponOffer: null,
}

const bar = () => screen.queryByRole('region', { name: 'הוספה מהירה לסל' })

describe('the sticky buy bar', () => {
  beforeEach(() => {
    observers.length = 0
    addToCart.mockClear()
    vi.stubGlobal('IntersectionObserver', FakeObserver)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is absent at first paint and while the buy row is below the fold', () => {
    render(<ProductInfo {...BASE} />)
    expect(observers).toHaveLength(1)
    expect(observers[0]?.target?.classList.contains('pdp-buy')).toBe(true)
    expect(bar()).toBeNull()
    place('below')
    expect(bar()).toBeNull()
  })

  it('appears once the row has scrolled off the top and leaves when it is back', () => {
    render(<ProductInfo {...BASE} />)
    place('above')
    const region = bar()
    expect(region).not.toBeNull()
    expect(region).toHaveTextContent('תיק גב')
    // The amount, whichever way this runtime's Intl places the sign.
    expect(region).toHaveTextContent(/199/)
    expect(document.body.classList.contains('pdp-sticky-visible')).toBe(true)

    place('visible')
    expect(bar()).toBeNull()
    expect(document.body.classList.contains('pdp-sticky-visible')).toBe(false)
  })

  it('adds the chosen variant and quantity, the same call as the row above', async () => {
    const red = {
      id: 'v-red',
      name_he: 'אדום',
      price: null,
      price_modifier: 0,
      stock_quantity: 9,
      sku: null,
    }
    render(<ProductInfo {...BASE} variants={[red]} />)
    fireEvent.click(screen.getByRole('button', { name: 'הוסף כמות' }))
    fireEvent.click(screen.getByRole('button', { name: 'הוסף כמות' }))
    place('above')
    expect(bar()).toHaveTextContent('אדום')
    expect(bar()).toHaveTextContent('כמות: 3')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'הוסף לסל, תיק גב' }))
    })
    expect(addToCart).toHaveBeenCalledWith(BASE.productId, 'v-red', 3, BASE.name)
    // And it reports the add the same way the row does.
    expect(screen.getByRole('button', { name: 'הוסף לסל, תיק גב' })).toHaveTextContent('נוסף לסל')
  })

  it('does not follow anyone with a product that cannot be bought', () => {
    render(<ProductInfo {...BASE} baseStock={0} />)
    place('above')
    expect(bar()).toBeNull()
  })

  it('is disabled, not hidden, while a variant is still to be chosen', () => {
    const one = {
      id: 'v-1',
      name_he: 'שחור',
      price: null,
      price_modifier: 0,
      stock_quantity: 5,
      sku: null,
    }
    const two = { ...one, id: 'v-2', name_he: 'לבן' }
    render(<ProductInfo {...BASE} variants={[one, two]} />)
    place('above')
    expect(screen.getByRole('button', { name: 'הוסף לסל, תיק גב' })).toBeDisabled()
  })

  it('renders nothing extra where there is no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<ProductInfo {...BASE} />)
    expect(bar()).toBeNull()
  })
})
