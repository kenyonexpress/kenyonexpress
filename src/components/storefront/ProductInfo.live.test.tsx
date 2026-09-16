import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE SUMMARY COLUMN AFTER THE CACHE: what a live event does to it, and the
 * three slots this goal added to it.
 *
 * `loadProductBySlug` is an hour old by design. The one way the page learns
 * that the shelf emptied under it is the `product:<id>` broadcast (235), and
 * this file drives that channel by hand: the message the trigger builds goes
 * in, and what is pinned is the buy button, the stock line and the price row
 * the shopper sees after it. Also pinned: the star row appears only with a
 * count, the heart and the share buttons are in the tag line, and the
 * strike-through follows the live compare-at.
 */

type BroadcastHandler = (message: { payload: unknown }) => void

const mock = vi.hoisted(() => ({
  handlers: [] as BroadcastHandler[],
  topics: [] as string[],
  addToCart: vi.fn(async () => true),
  push: vi.fn(),
  saved: false,
}))

vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart: mock.addToCart, isPending: false }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mock.push }) }))
vi.mock('@/server/actions/reviews', () => ({
  getWishlistSaved: async () => mock.saved,
  toggleWishlist: async () => {
    mock.saved = !mock.saved
    return { ok: true, saved: mock.saved }
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = {
      on: (_type: string, _cfg: { event: string }, cb: BroadcastHandler) => {
        mock.handlers.push(cb)
        return channel
      },
      subscribe: () => channel,
    }
    return {
      channel: (topic: string) => {
        mock.topics.push(topic)
        return channel
      },
      removeChannel: async () => 'ok' as const,
    }
  },
}))

import ProductInfo from './ProductInfo'

const ID = '11111111-1111-4111-8111-111111111111'

const BASE = {
  productId: ID,
  name: 'תיק גב',
  nameEn: null,
  basePrice: 150,
  oldPrice: 200,
  baseStock: 10,
  sku: 'SKU-1',
  categoryName: 'תיקים',
  city: null,
  attributes: [],
  variants: [],
  isCoupon: false,
  couponOffer: null,
}

const EVENT = {
  product_id: ID,
  stock_quantity: 10,
  available: 10,
  kenyon_price: 150,
  full_price: 200,
  status: 'active',
  deleted_at: null,
}

function deliver(payload: unknown) {
  act(() => {
    for (const cb of mock.handlers) cb({ payload })
  })
}

// The add-to-cart pill by its own class: after a sell-out both it and the
// buy-now button read "אזל מהמלאי", and a role query then finds two.
const buy = () => document.querySelector('.pdp-buy__atc') as HTMLButtonElement
const priceRow = () => document.querySelector('.pdp-summary__price') as HTMLElement
const stockLine = () => document.querySelector('.pdp-summary__stock') as HTMLElement

describe('the summary column on its live topic', () => {
  beforeEach(() => {
    mock.handlers.length = 0
    mock.topics.length = 0
    mock.addToCart.mockClear()
    mock.saved = false
  })

  it('listens on product:<id> and paints the cache until told otherwise', () => {
    render(<ProductInfo {...BASE} />)
    expect(mock.topics).toEqual([`product:${ID}`])
    expect(buy()).not.toBeDisabled()
    expect(stockLine()).toHaveTextContent('במלאי, מוכן למשלוח')
    expect(stockLine().getAttribute('data-live')).toBeNull()
    expect(priceRow()).toHaveTextContent('150')
    expect(priceRow().querySelector('del')).toHaveTextContent('200')
  })

  it('an emptied shelf disables the buy row and says so, with no reload', () => {
    render(<ProductInfo {...BASE} />)
    deliver({ ...EVENT, stock_quantity: 0, available: 0 })
    expect(buy()).toBeDisabled()
    expect(buy()).toHaveTextContent('אזל מהמלאי')
    expect(stockLine()).toHaveTextContent('אזל מהמלאי')
    expect(stockLine().getAttribute('data-live')).toBe('true')
    expect(screen.getByLabelText('כמות')).toBeDisabled()
  })

  it('a live hold lowers the quantity ceiling to what is actually free', () => {
    render(<ProductInfo {...BASE} />)
    const qty = () => screen.getByLabelText('כמות') as HTMLInputElement
    expect(qty().max).toBe('10')
    deliver({ ...EVENT, stock_quantity: 10, available: 2 })
    expect(qty().max).toBe('2')
  })

  it('a price change moves the number and the strike-through together', () => {
    render(<ProductInfo {...BASE} />)
    deliver({ ...EVENT, kenyon_price: 120, full_price: 240 })
    expect(priceRow()).toHaveTextContent('120')
    expect(priceRow().querySelector('del')).toHaveTextContent('240')
    expect(priceRow()).toHaveTextContent('50%')
    deliver({ ...EVENT, kenyon_price: 120, full_price: 120 })
    expect(priceRow().querySelector('del')).toBeNull()
  })

  it('a withdrawn product stops offering itself', () => {
    render(<ProductInfo {...BASE} />)
    deliver({ ...EVENT, status: 'draft' })
    expect(buy()).toBeDisabled()
    expect(buy()).toHaveTextContent('לא זמין לרכישה')
    expect(stockLine()).toHaveTextContent('המוצר אינו זמין עוד')
    expect(screen.getByRole('button', { name: 'קנה עכשיו' })).toBeDisabled()
  })

  it('ignores a malformed message and one about another product', () => {
    render(<ProductInfo {...BASE} />)
    deliver({ nonsense: true })
    deliver({ ...EVENT, product_id: '22222222-2222-4222-8222-222222222222', stock_quantity: 0 })
    expect(buy()).not.toBeDisabled()
    expect(stockLine().getAttribute('data-live')).toBeNull()
  })
})

describe('the three slots beside the price', () => {
  beforeEach(() => {
    mock.handlers.length = 0
    mock.saved = false
  })

  it('shows stars only with an approved count, and never a zero-count score', () => {
    const { unmount } = render(<ProductInfo {...BASE} rating={{ average: 4.5, count: 12 }} />)
    expect(screen.getByRole('img', { name: 'דירוג 4.5 מתוך 5, 12 ביקורות' })).toBeInTheDocument()
    unmount()

    render(<ProductInfo {...BASE} rating={{ average: 5, count: 0 }} />)
    expect(screen.queryByRole('img', { name: /דירוג/ })).toBeNull()
    // The identifiers still hold the slot.
    expect(screen.getByText(/מק"ט/)).toBeInTheDocument()
  })

  it('a single review is worded as one', () => {
    render(<ProductInfo {...BASE} rating={{ average: 3, count: 1 }} />)
    expect(screen.getByRole('img', { name: 'דירוג 3 מתוך 5, ביקורת אחת' })).toBeInTheDocument()
  })

  it('carries the wishlist heart and toggles it through the action', async () => {
    render(<ProductInfo {...BASE} />)
    const heart = await screen.findByRole('button', { name: 'הוסף לרשימת המשאלות' })
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    await act(async () => {
      fireEvent.click(heart)
    })
    expect(await screen.findByRole('button', { name: 'הסר מרשימת המשאלות' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('offers a copy-link share where the browser has no share sheet', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ProductInfo {...BASE} />)
    const share = await screen.findByRole('button', { name: 'העתקת קישור' })
    await act(async () => {
      fireEvent.click(share)
    })
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(screen.getByRole('button', { name: 'הקישור הועתק' })).toBeInTheDocument()
    // The two channel buttons are still there beside it.
    expect(screen.getByRole('button', { name: 'שתפו בוואטסאפ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שיתוף בפייסבוק' })).toBeInTheDocument()
  })

  it('uses the share sheet when there is one', async () => {
    const share = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    try {
      render(<ProductInfo {...BASE} />)
      const button = await screen.findByRole('button', { name: 'שיתוף' })
      await act(async () => {
        fireEvent.click(button)
      })
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'תיק גב', url: window.location.href }),
      )
    } finally {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    }
  })
})
