import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * One-click reorder, end to end through its mocks: the cart is rebuilt from
 * the order's lines through the real add path, the saved card is handed to
 * `beginCheckout`, and the three outcomes that are not "paid" (3DS challenge,
 * no card, no address) each come back as the thing the button must do next.
 */

type Result = { data: unknown; error: unknown }

const calls: { table: string; op: string; payload?: unknown }[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(table: string, op: string, payload?: unknown): never {
  calls.push({ table, op, payload })
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return () => {
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
  }),
}

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '55555555-5555-4555-8555-555555555555'
const NEW_ORDER_ID = '77777777-7777-4777-8777-777777777777'
const CLIENT_REF = '66666666-6666-4666-8666-666666666666'
const ADDRESS_ID = '44444444-4444-4444-8444-444444444444'
const DEFAULT_ADDRESS_ID = '48444444-4444-4444-8444-444444444444'
const TOKEN_ID = '99999999-9999-4999-8999-999999999999'
const P1 = '22222222-2222-4222-8222-222222222221'
const P2 = '22222222-2222-4222-8222-222222222222'

const getUser = vi.fn(async () => ({ data: { user: { id: USER_ID } } }))
const gate = vi.hoisted(() => ({ live: true, reasons: [] as string[] }))
const clearCart = vi.hoisted(() => vi.fn())
const addToCart = vi.hoisted(() => vi.fn())
const beginCheckout = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit: async () => true }))
vi.mock('@/lib/payments', () => ({ loadCardcomEnv: () => ({}) }))
vi.mock('@/lib/payments/provider-gate', () => ({
  PAYMENT_GATE_CLOSED_MESSAGE: 'gate closed',
  assessPaymentProviderGate: () => gate,
}))
vi.mock('@/server/actions/cart', () => ({
  clearCart: () => clearCart(),
  addToCart: (...args: unknown[]) => addToCart(...args),
}))
vi.mock('@/server/actions/payments/checkout', () => ({
  beginCheckout: (input: unknown) => beginCheckout(input),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { reorderOneClick } = await import('./reorder')

const PAID_ORDER = {
  id: ORDER_ID,
  user_id: USER_ID,
  status: 'paid',
  paid_at: '2026-09-01T10:00:00Z',
  address_id: ADDRESS_ID,
  deleted_at: null,
}
const LINES = [
  { product_id: P1, variant_id: null, quantity: 2 },
  { product_id: P2, variant_id: 'v-1', quantity: 1 },
]
const TOKENS = [
  {
    id: TOKEN_ID,
    last_4: '4580',
    card_brand: 'Visa',
    expiry_month: 12,
    expiry_year: 2030,
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
  },
]

function arrangeHappyPath() {
  queue('orders.select', { data: PAID_ORDER, error: null })
  queue('order_items.select', { data: LINES, error: null })
  queue('payment_tokens.select', { data: TOKENS, error: null })
  queue('user_addresses.select', {
    data: { id: ADDRESS_ID, user_id: USER_ID, deleted_at: null },
    error: null,
  })
  clearCart.mockResolvedValue({ ok: true, cart: { items: [] } })
  addToCart.mockResolvedValue({ ok: true, cart: { items: [] } })
  beginCheckout.mockResolvedValue({ ok: true, data: { kind: 'paid', order_id: NEW_ORDER_ID } })
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  gate.live = true
  clearCart.mockReset()
  addToCart.mockReset()
  beginCheckout.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe('reorderOneClick', () => {
  it('rebuilds the cart line by line and charges the default saved card with no wallet', async () => {
    arrangeHappyPath()
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })

    expect(result).toEqual({ ok: true, kind: 'paid', order_id: NEW_ORDER_ID, skipped: [] })
    expect(clearCart).toHaveBeenCalledTimes(1)
    expect(addToCart.mock.calls).toEqual([
      [P1, null, 2],
      [P2, 'v-1', 1],
    ])
    expect(beginCheckout).toHaveBeenCalledWith({
      client_ref: CLIENT_REF,
      accept_terms: true,
      channel: 'web',
      apply_wallet_ils: 0,
      save_card: false,
      address_id: ADDRESS_ID,
      token_id: TOKEN_ID,
    })
  })

  it('hands the hosted page back as a challenge when the issuer demands 3DS', async () => {
    arrangeHappyPath()
    beginCheckout.mockResolvedValue({
      ok: true,
      data: {
        kind: 'redirect',
        order_id: NEW_ORDER_ID,
        redirect_url: 'https://secure.cardcom.solutions/lp/abc',
      },
    })
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toEqual({
      ok: true,
      kind: 'challenge',
      order_id: NEW_ORDER_ID,
      redirect_url: 'https://secure.cardcom.solutions/lp/abc',
      skipped: [],
    })
  })

  it('rebuilds the cart and sends the shopper to checkout when no live card is saved', async () => {
    arrangeHappyPath()
    queues.set('payment_tokens.select', [
      {
        data: [{ ...TOKENS[0], expiry_month: 1, expiry_year: 2020 }],
        error: null,
      },
    ])
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toEqual({ ok: true, kind: 'checkout', reason: 'no_card', skipped: [] })
    expect(addToCart).toHaveBeenCalledTimes(2)
    expect(beginCheckout).not.toHaveBeenCalled()
  })

  it('sends the shopper to checkout for the address when the basket needs one and none is on file', async () => {
    arrangeHappyPath()
    queues.set('user_addresses.select', [{ data: null, error: null }])
    beginCheckout.mockResolvedValue({ ok: false, error: 'נדרשת כתובת', code: 'ADDRESS_REQUIRED' })
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toEqual({ ok: true, kind: 'checkout', reason: 'no_address', skipped: [] })
    expect(beginCheckout).toHaveBeenCalledWith(expect.objectContaining({ address_id: null }))
  })

  it('falls back to the current default address when the original one was deleted', async () => {
    arrangeHappyPath()
    queues.set('user_addresses.select', [
      {
        data: { id: ADDRESS_ID, user_id: USER_ID, deleted_at: '2026-09-15T00:00:00Z' },
        error: null,
      },
      { data: { id: DEFAULT_ADDRESS_ID }, error: null },
    ])
    await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(beginCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ address_id: DEFAULT_ADDRESS_ID }),
    )
  })

  it('skips a line the cart refuses, names it, and still charges the rest', async () => {
    arrangeHappyPath()
    addToCart
      .mockResolvedValueOnce({ ok: false, error: 'אזל מהמלאי', code: 'INSUFFICIENT_STOCK' })
      .mockResolvedValueOnce({ ok: true, cart: { items: [] } })
    queue('products.select', { data: [{ id: P1, name_he: 'מוצר ראשון' }], error: null })
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toEqual({
      ok: true,
      kind: 'paid',
      order_id: NEW_ORDER_ID,
      skipped: ['מוצר ראשון'],
    })
    expect(beginCheckout).toHaveBeenCalledTimes(1)
  })

  it('refuses without charging when no line could be added', async () => {
    arrangeHappyPath()
    addToCart.mockResolvedValue({ ok: false, error: 'אזל מהמלאי', code: 'INSUFFICIENT_STOCK' })
    queue('products.select', { data: [], error: null })
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toMatchObject({ ok: false, code: 'NO_LINES', cartRebuilt: true })
    expect(beginCheckout).not.toHaveBeenCalled()
  })

  it('carries a decline back with the cart left rebuilt, so the shopper can pay another way', async () => {
    arrangeHappyPath()
    beginCheckout.mockResolvedValue({
      ok: false,
      error: 'החיוב נדחה',
      code: 'PAYMENT_PROVIDER_ERROR',
    })
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toEqual({
      ok: false,
      error: 'החיוב נדחה',
      code: 'PAYMENT_PROVIDER_ERROR',
      cartRebuilt: true,
    })
  })

  it("does not touch the cart for another customer's order", async () => {
    arrangeHappyPath()
    queues.set('orders.select', [{ data: { ...PAID_ORDER, user_id: 'someone-else' }, error: null }])
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND', cartRebuilt: false })
    expect(clearCart).not.toHaveBeenCalled()
  })

  it('refuses an order that was never paid', async () => {
    arrangeHappyPath()
    queues.set('orders.select', [
      { data: { ...PAID_ORDER, status: 'pending', paid_at: null }, error: null },
    ])
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(clearCart).not.toHaveBeenCalled()
  })

  it('reports a failed order read as a retry, not as a missing order', async () => {
    arrangeHappyPath()
    queues.set('orders.select', [{ data: null, error: { message: 'connection terminated' } }])
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toMatchObject({ ok: false, error: 'לא ניתן לקרוא את ההזמנה כרגע, נסו שוב' })
  })

  it('stops at a closed payment gate before the cart is replaced', async () => {
    arrangeHappyPath()
    gate.live = false
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toMatchObject({ ok: false, code: 'CHECKOUT_DISABLED', cartRebuilt: false })
    expect(clearCart).not.toHaveBeenCalled()
  })

  it('requires a signed-in customer', async () => {
    arrangeHappyPath()
    getUser.mockResolvedValue({ data: { user: null } } as never)
    const result = await reorderOneClick({ order_id: ORDER_ID, client_ref: CLIENT_REF })
    expect(result).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' })
  })

  it('rejects a malformed request before reading anything', async () => {
    const result = await reorderOneClick({ order_id: 'nope', client_ref: CLIENT_REF })
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(calls).toHaveLength(0)
  })
})
