import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The cart store is where a shopper's optimistic view and the server's answer
 * are reconciled, and it had no tests at all.
 *
 * The behaviour that matters is the failure behaviour. A cart that keeps an
 * optimistic count on screen after the write failed tells a shopper they have
 * something they do not, and that is precisely what the stock Supabase demo key
 * produced: every guest add-to-cart threw, the count went up, and nothing said
 * a word (STATE, 2026-07-29). So both failure shapes are asserted here: a
 * returned `{ ok: false }` AND a thrown action.
 */

const addToCart = vi.fn()
const updateCartItem = vi.fn()
const removeFromCart = vi.fn()
const clearCart = vi.fn()

vi.mock('@/server/actions/cart', () => ({
  addToCart: (...args: unknown[]) => addToCart(...args),
  updateCartItem: (...args: unknown[]) => updateCartItem(...args),
  removeFromCart: (...args: unknown[]) => removeFromCart(...args),
  clearCart: () => clearCart(),
}))

const { applyOptimistic, createCartStore } = await import('@/lib/cart/store')

function item(overrides: Partial<CartViewItem> = {}): CartViewItem {
  return {
    product_id: 'p1',
    variant_id: null,
    quantity: 2,
    name_he: 'מוצר',
    slug: 'p1',
    image_url: null,
    unit_price: agorot(100),
    line_total: agorot(200),
    type: 'physical',
    available: true,
    platform_fee: agorot(10),
    supplier_due: agorot(90),
    customer_pays_now: agorot(100),
    balance_due_at_business: agorot(0),
    platform_percent_bp: 500,
    platform_percent_snapshot: 5,
    coupon_price_unit: null,
    ...overrides,
  }
}

function cart(items: CartViewItem[]): CartView {
  return {
    ...EMPTY_CART,
    id: 'cart-1',
    items,
    item_count: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: agorot(items.reduce((sum, i) => sum + i.line_total, 0)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('applyOptimistic', () => {
  it('raises the count on add without inventing a line it cannot describe', () => {
    const next = applyOptimistic(cart([item()]), {
      type: 'add',
      productId: 'p2',
      variantId: null,
      quantity: 1,
    })
    expect(next.item_count).toBe(3)
    // No name, price or availability is known for p2 until the server answers,
    // so no row is fabricated.
    expect(next.items).toHaveLength(1)
  })

  it('caps the optimistic count at 99', () => {
    const next = applyOptimistic(
      { ...EMPTY_CART, item_count: 98 },
      {
        type: 'add',
        productId: 'p1',
        variantId: null,
        quantity: 5,
      },
    )
    expect(next.item_count).toBe(99)
  })

  it('changes a quantity and recounts from the lines', () => {
    const next = applyOptimistic(cart([item(), item({ product_id: 'p2', quantity: 1 })]), {
      type: 'setQty',
      productId: 'p1',
      variantId: null,
      quantity: 5,
    })
    expect(next.items.find((i) => i.product_id === 'p1')?.quantity).toBe(5)
    expect(next.item_count).toBe(6)
  })

  it('treats a quantity of zero as a removal', () => {
    const next = applyOptimistic(cart([item()]), {
      type: 'setQty',
      productId: 'p1',
      variantId: null,
      quantity: 0,
    })
    expect(next.items).toHaveLength(0)
    expect(next.item_count).toBe(0)
  })

  // Two lines of the same product in different variants are different rows, and
  // matching on product_id alone would drop both.
  it('distinguishes variants of the same product', () => {
    const lines = [item({ variant_id: 'red' }), item({ variant_id: 'blue', quantity: 1 })]
    const next = applyOptimistic(cart(lines), {
      type: 'remove',
      productId: 'p1',
      variantId: 'red',
    })
    expect(next.items.map((i) => i.variant_id)).toEqual(['blue'])
    expect(next.item_count).toBe(1)
  })

  it('treats undefined and null variants as the same row', () => {
    const next = applyOptimistic(cart([item({ variant_id: null })]), {
      type: 'remove',
      productId: 'p1',
      variantId: undefined as unknown as null,
    })
    expect(next.items).toHaveLength(0)
  })

  it('replaces the whole view when the server sends one', () => {
    const server = cart([item({ product_id: 'p9' })])
    expect(applyOptimistic(EMPTY_CART, { type: 'replace', cart: server })).toBe(server)
  })
})

describe('cart store', () => {
  it('shows the item immediately and keeps the server answer', async () => {
    const confirmed = cart([item({ quantity: 1 })])
    let resolveAction: (value: unknown) => void = () => undefined
    addToCart.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve
      }),
    )

    const store = createCartStore(EMPTY_CART)
    const pending = store.getState().addToCart('p1', null, 1, 'מוצר')

    expect(store.getState().cart.item_count).toBe(1)
    expect(store.getState().isPending).toBe(true)

    resolveAction({ ok: true, cart: confirmed })
    await pending

    expect(store.getState().cart).toBe(confirmed)
    expect(store.getState().serverCart).toBe(confirmed)
    expect(store.getState().isPending).toBe(false)
  })

  it('opens the drawer and reports the product by name on a successful add', async () => {
    addToCart.mockResolvedValue({ ok: true, cart: cart([item({ quantity: 1 })]) })
    const feedback = vi.fn()
    const store = createCartStore(EMPTY_CART, feedback)
    await store.getState().addToCart('p1', null, 1, 'אוזניות')
    expect(store.getState().drawerOpen).toBe(true)
    expect(feedback).toHaveBeenCalledWith({ kind: 'added', message: 'אוזניות נוסף לעגלה' })
  })

  it('rolls the count back and surfaces the reason when the server refuses', async () => {
    addToCart.mockResolvedValue({ ok: false, error: 'אזל מהמלאי', code: 'out_of_stock' })
    const feedback = vi.fn()
    const store = createCartStore(EMPTY_CART, feedback)

    await store.getState().addToCart('p1', null, 1)

    expect(store.getState().cart.item_count).toBe(0)
    expect(store.getState().drawerOpen).toBe(false)
    expect(feedback).toHaveBeenCalledWith({ kind: 'error', message: 'אזל מהמלאי' })
  })

  // The silent-failure case. A thrown action used to leave the optimistic count
  // on screen with no toast at all.
  it('rolls back and says something when the action throws', async () => {
    addToCart.mockRejectedValue(new Error('boom'))
    const feedback = vi.fn()
    const store = createCartStore(EMPTY_CART, feedback)

    await store.getState().addToCart('p1', null, 1)

    expect(store.getState().cart.item_count).toBe(0)
    expect(store.getState().isPending).toBe(false)
    expect(feedback).toHaveBeenCalledWith({ kind: 'error', message: 'הפעולה נכשלה, נסו שוב' })
  })

  it('rolls back to the last server-confirmed cart, not to the optimistic one', async () => {
    const start = cart([item({ quantity: 2 })])
    updateCartItem.mockResolvedValue({ ok: false, error: 'שגיאה', code: 'x' })
    const store = createCartStore(start)

    await store.getState().updateQuantity('p1', null, 7)

    expect(store.getState().cart).toEqual(start)
  })

  it('reports a removal and drops the line on success', async () => {
    const after = cart([])
    removeFromCart.mockResolvedValue({ ok: true, cart: after })
    const feedback = vi.fn()
    const store = createCartStore(cart([item()]), feedback)

    await store.getState().removeItem('p1', null)

    expect(store.getState().cart.items).toHaveLength(0)
    expect(feedback).toHaveBeenCalledWith({ kind: 'removed', message: 'הפריט הוסר מהעגלה' })
  })

  it('empties the view at once when clearing, and restores it if the clear fails', async () => {
    const start = cart([item()])
    clearCart.mockRejectedValue(new Error('down'))
    const store = createCartStore(start)

    const pending = store.getState().clear()
    expect(store.getState().cart.items).toHaveLength(0)
    await pending

    expect(store.getState().cart).toEqual(start)
  })

  // isPending drives the disabled state of every quantity control. If it clears
  // on the first settle, a shopper can fire a second write while the first is in
  // flight and the slower answer wins.
  it('stays pending until the last of several in-flight writes settles', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    updateCartItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const store = createCartStore(cart([item(), item({ product_id: 'p2', quantity: 1 })]))

    const first = store.getState().updateQuantity('p1', null, 3)
    const second = store.getState().updateQuantity('p2', null, 4)
    expect(store.getState().pendingOps).toBe(2)

    resolvers[0]?.({ ok: true, cart: cart([item({ quantity: 3 })]) })
    await first
    expect(store.getState().isPending).toBe(true)

    resolvers[1]?.({ ok: true, cart: cart([item({ quantity: 3 })]) })
    await second
    expect(store.getState().isPending).toBe(false)
    expect(store.getState().pendingOps).toBe(0)
  })

  it('setCart moves the rollback target too, so a later failure cannot resurrect an old cart', () => {
    const store = createCartStore(EMPTY_CART)
    const fresh = cart([item()])
    store.getState().setCart(fresh)
    expect(store.getState().cart).toBe(fresh)
    expect(store.getState().serverCart).toBe(fresh)
  })

  it('opens, closes and toggles the drawer', () => {
    const store = createCartStore(EMPTY_CART)
    store.getState().openDrawer()
    expect(store.getState().drawerOpen).toBe(true)
    store.getState().closeDrawer()
    expect(store.getState().drawerOpen).toBe(false)
    store.getState().toggleDrawer()
    expect(store.getState().drawerOpen).toBe(true)
  })

  // Module state on the server is shared across requests, so a singleton store
  // would hand one shopper's cart to the next request during SSR.
  it('gives every mount its own store', () => {
    const a = createCartStore(cart([item()]))
    const b = createCartStore(EMPTY_CART)
    a.getState().openDrawer()
    expect(b.getState().drawerOpen).toBe(false)
    expect(b.getState().cart.items).toHaveLength(0)
  })
})
