import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The offline replay route. What is asserted is the DECISION per line: an
 * absolute quantity from the queue becomes an add, an update or a removal
 * against the cart the server holds, through the same actions a live press
 * uses, and a line the server refuses is reported rather than failing the
 * replay or being silently dropped.
 */

const getCart = vi.fn()
const addToCart = vi.fn()
const updateCartItem = vi.fn()
const removeFromCart = vi.fn()
vi.mock('@/server/actions/cart', () => ({
  getCart: () => getCart(),
  addToCart: (...args: unknown[]) => addToCart(...args),
  updateCartItem: (...args: unknown[]) => updateCartItem(...args),
  removeFromCart: (...args: unknown[]) => removeFromCart(...args),
}))

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))

const rateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimit(...args),
  rateLimitHeaders: () => ({ 'retry-after': '60' }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  getClientIp: async () => '203.0.113.5',
}))

const { POST } = await import('./route')

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const V1 = '33333333-3333-4333-8333-333333333333'

const line = (product_id: string, quantity: number, variant_id: string | null = null) => ({
  product_id,
  variant_id,
  quantity,
  name_he: 'מוצר',
  slug: 'x',
  image_url: null,
  unit_price: 100,
  line_total: 100 * quantity,
  type: 'physical',
  available: true,
})

const cartOf = (items: ReturnType<typeof line>[]) => ({
  id: 'c1',
  items,
  item_count: items.reduce((s, i) => s + i.quantity, 0),
})

const post = (body: unknown) =>
  new Request('http://localhost/api/cart/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: null } })
  rateLimit.mockResolvedValue({ allowed: true })
  getCart.mockResolvedValue(cartOf([]))
  addToCart.mockImplementation(async (id: string, variant: string | null, qty: number) => ({
    ok: true,
    cart: cartOf([line(id, qty, variant)]),
  }))
  updateCartItem.mockImplementation(async (id: string, variant: string | null, qty: number) => ({
    ok: true,
    cart: cartOf([line(id, qty, variant)]),
  }))
  removeFromCart.mockResolvedValue({ ok: true, cart: cartOf([]) })
})

describe('POST /api/cart/sync', () => {
  it('adds a line the cart does not hold, at the queued quantity', async () => {
    const res = await POST(post({ lines: [{ product_id: P1, variant_id: null, quantity: 3 }] }))
    expect(res.status).toBe(200)
    expect(addToCart).toHaveBeenCalledWith(P1, null, 3)
    expect(updateCartItem).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.cart.item_count).toBe(3)
    expect(body.rejected).toEqual([])
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('updates a line the cart holds, never adds on top of it', async () => {
    getCart.mockResolvedValue(cartOf([line(P1, 1)]))
    await POST(post({ lines: [{ product_id: P1, variant_id: null, quantity: 4 }] }))
    expect(updateCartItem).toHaveBeenCalledWith(P1, null, 4)
    expect(addToCart).not.toHaveBeenCalled()
  })

  it('removes on a zero, and skips a zero for a line the cart never had', async () => {
    getCart.mockResolvedValue(cartOf([line(P1, 1)]))
    await POST(
      post({
        lines: [
          { product_id: P1, variant_id: null, quantity: 0 },
          { product_id: P2, variant_id: null, quantity: 0 },
        ],
      }),
    )
    expect(removeFromCart).toHaveBeenCalledTimes(1)
    expect(removeFromCart).toHaveBeenCalledWith(P1, null)
  })

  it('skips a line already at the queued quantity: a replayed replay writes nothing', async () => {
    getCart.mockResolvedValue(cartOf([line(P1, 2)]))
    await POST(post({ lines: [{ product_id: P1, variant_id: null, quantity: 2 }] }))
    expect(addToCart).not.toHaveBeenCalled()
    expect(updateCartItem).not.toHaveBeenCalled()
    expect(removeFromCart).not.toHaveBeenCalled()
  })

  it('treats a variant as its own line', async () => {
    getCart.mockResolvedValue(cartOf([line(P1, 1)]))
    await POST(post({ lines: [{ product_id: P1, variant_id: V1, quantity: 1 }] }))
    expect(addToCart).toHaveBeenCalledWith(P1, V1, 1)
  })

  it('lets the last entry for a line win when the body repeats it', async () => {
    await POST(
      post({
        lines: [
          { product_id: P1, variant_id: null, quantity: 1 },
          { product_id: P1, variant_id: null, quantity: 5 },
        ],
      }),
    )
    expect(addToCart).toHaveBeenCalledTimes(1)
    expect(addToCart).toHaveBeenCalledWith(P1, null, 5)
  })

  it('reports a refused line and still lands the rest, as 200', async () => {
    addToCart.mockImplementation(async (id: string, variant: string | null, qty: number) =>
      id === P1
        ? { ok: false, error: 'אין מספיק במלאי' }
        : { ok: true, cart: cartOf([line(id, qty, variant)]) },
    )
    const res = await POST(
      post({
        lines: [
          { product_id: P1, variant_id: null, quantity: 9 },
          { product_id: P2, variant_id: null, quantity: 1 },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rejected).toEqual([{ product_id: P1, variant_id: null, error: 'אין מספיק במלאי' }])
    expect(body.cart.items.map((i: { product_id: string }) => i.product_id)).toEqual([P2])
  })

  it('refuses a malformed body with 400 and writes nothing', async () => {
    for (const body of [
      'not json',
      {},
      { lines: [] },
      { lines: [{ product_id: 'nope', variant_id: null, quantity: 1 }] },
      { lines: [{ product_id: P1, variant_id: null, quantity: 100 }] },
      { lines: [{ product_id: P1, variant_id: null, quantity: 1.5 }] },
    ]) {
      const res = await POST(post(body))
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(addToCart).not.toHaveBeenCalled()
  })

  it('caps one replay at 50 lines', async () => {
    const lines = Array.from({ length: 51 }, (_, i) => ({
      product_id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
      variant_id: null,
      quantity: 1,
    }))
    expect((await POST(post({ lines }))).status).toBe(400)
  })

  it('spends the cart_write budget for the shopper, user id first, IP for a guest', async () => {
    await POST(post({ lines: [{ product_id: P1, variant_id: null, quantity: 1 }] }))
    expect(rateLimit).toHaveBeenCalledWith('cart_write', 'ip:203.0.113.5')

    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    await POST(post({ lines: [{ product_id: P1, variant_id: null, quantity: 1 }] }))
    expect(rateLimit).toHaveBeenCalledWith('cart_write', 'user:u1')
  })

  it('answers 429 with Retry-After when the budget is spent, before reading the body', async () => {
    rateLimit.mockResolvedValue({ allowed: false })
    const res = await POST(post({ lines: [{ product_id: P1, variant_id: null, quantity: 1 }] }))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(getCart).not.toHaveBeenCalled()
  })
})
