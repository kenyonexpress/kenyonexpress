import { CART_COUPON_COOKIE } from '@/lib/cart/coupon-cookie'
import { CART_SHIPPING_COOKIE } from '@/lib/cart/shipping-cookie'
import { luhnCheckDigit } from '@/lib/coupons/unit-codes'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The cart actions. The pricer, the coupon and campaign judgements, the
 * stacking rules and the merge's read-failure behaviour are proven in their
 * own tests; what can only fail here is the plumbing: which row is read under
 * which identity, that every write carries the server-read percent snapshot
 * and never a client one, that a refusal stops BEFORE the write, that the
 * coupon cookie is written only after the code priced against this cart, and
 * that the two code tables are consulted in the documented order.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()
/** A per-key answer computed from the call itself, for keys hit by two readers. */
const resolvers = new Map<string, (record: Call) => Result | undefined>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

function settle(key: string, record: Call): Result {
  const resolved = resolvers.get(key)?.(record)
  if (resolved) return resolved
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(client: string, table: string, op: string, payload?: unknown): never {
  const record: Call = { table: `${client}:${table}`, op, payload, chain: [] }
  calls.push(record)
  const key = `${client}:${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key, record)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          if (prop === 'maybeSingle' || prop === 'single') {
            return Promise.resolve(settle(key, record))
          }
          return proxy
        }
      },
    },
  )
  return proxy as never
}

function fakeClient(name: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(name, table, 'select', args[0]),
      update: (payload: unknown) => builder(name, table, 'update', payload),
      insert: (payload: unknown) => builder(name, table, 'insert', payload),
      delete: () => builder(name, table, 'delete'),
    }),
  }
}

const chainArg = (record: Call, method: string, column: string): unknown =>
  record.chain.find(([m, a]) => m === method && a[0] === column)?.[1][1]

// ── Fixtures ────────────────────────────────────────────────────────────────

const USER = '11111111-1111-4111-8111-111111111111'
const GUEST = '22222222-2222-4222-8222-222222222222'
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const P3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const V1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const IP = '203.0.113.9'

function product(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    slug: `slug-${id.slice(0, 4)}`,
    name_he: 'מוצר',
    type: 'physical',
    kenyon_price: 100,
    stock_quantity: 10,
    status: 'active',
    deleted_at: null,
    images: [],
    is_coupon_enabled: false,
    full_price: null,
    platform_percent: 10,
    coupon_price_ils: null,
    cashback_percent: null,
    ...over,
  }
}

function variant(id: string, productId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    product_id: productId,
    price: null,
    price_modifier: 0,
    stock_quantity: 3,
    is_active: true,
    deleted_at: null,
    ...over,
  }
}

function campaign(code: string, over: Record<string, unknown> = {}) {
  return {
    id: `camp-${code}`,
    code,
    name: code,
    kind: 'percent',
    percent_bp: 1000,
    amount_agorot: null,
    min_order_agorot: 0,
    max_discount_agorot: null,
    starts_at: null,
    expires_at: null,
    max_uses: null,
    max_uses_per_user: 1,
    used_count: 0,
    allow_stacking: true,
    is_active: true,
    ...over,
  }
}

const item = (product_id: string, quantity = 1, variant_id: string | null = null) => ({
  product_id,
  variant_id,
  quantity,
  platform_percent_snapshot: 10,
})

/** The catalogue both the validator (by id) and the pricer (by list) read. */
const catalogue = new Map<string, ReturnType<typeof product>>()
const variantRows = new Map<string, ReturnType<typeof variant>>()
let giftCardRead: Result = { data: [], error: null }
let cartWriteError: unknown = null

// ── Mocks ───────────────────────────────────────────────────────────────────

const getUser = vi.fn()
const requestClient = { ...fakeClient('request'), auth: { getUser } }
const createGuestCartClient = vi.fn((_sessionId: string) => fakeClient('guest'))

const jar = new Map<string, string>()
const cookieSet = vi.fn((name: string, value: string, _options?: unknown) => {
  jar.set(name, value)
})
const cookieDelete = vi.fn((name: string) => {
  jar.delete(name)
})
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
  set: (name: string, value: string, options: unknown) => cookieSet(name, value, options),
  delete: (name: string) => cookieDelete(name),
}

const byCode = vi.fn()
const byUnitCode = vi.fn()
const checkRateLimit = vi.fn()
const getGuestSessionId = vi.fn()
const ensureGuestSessionId = vi.fn()
const rememberCartRow = vi.fn()
const forgetCartRow = vi.fn()
const readCartRowThrough = vi.fn()
const revalidatePath = vi.fn()
const logError = vi.fn()
const loadCartProductData = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/supabase/anon', () => ({
  createPublicClient: () => fakeClient('public'),
  createGuestCartClient: (sessionId: string) => createGuestCartClient(sessionId),
}))
vi.mock('@/lib/cart/load-products', () => ({
  loadCartProductData: (...a: unknown[]) => loadCartProductData(...a),
}))
vi.mock('@/lib/cart/session-cache', () => ({
  readCartRowThrough: (...a: unknown[]) => readCartRowThrough(...a),
  rememberCartRow: (...a: unknown[]) => rememberCartRow(...a),
  forgetCartRow: (...a: unknown[]) => forgetCartRow(...a),
}))
vi.mock('@/lib/cart/guest-session', () => ({
  GUEST_SESSION_COOKIE: 'ke_session_id',
  getGuestSessionId: () => getGuestSessionId(),
  ensureGuestSessionId: () => ensureGuestSessionId(),
}))
vi.mock('@/lib/growth/client', () => ({
  growthClient: () => ({
    campaigns: () => ({
      byCode: (code: string) => byCode(code),
      byUnitCode: (code: string) => byUnitCode(code),
    }),
  }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  getClientIp: async () => IP,
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))

const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  removeUnavailableItems,
  mergeGuestCart,
  clearGuestSessionCookie,
  applyCouponCode,
  removeCouponCode,
  setShippingMethod,
  resolveCheckoutDiscountAgorot,
} = await import('./cart')

const find = (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op)
// `queues.set`, not `queue()`: the NEXT read must see exactly this row, and
// appending behind a sticky single entry would return the old one first.
const userRow = (items: unknown[], id = 'user-cart') =>
  queues.set('request:carts.select', [{ data: { id, items }, error: null }])
const guestRow = (items: unknown[], id = 'guest-cart') =>
  queues.set('guest:carts.select', [{ data: { id, items }, error: null }])
const signedOut = () => getUser.mockResolvedValue({ data: { user: null } })

/** A printed unit code: 7 digits plus their Luhn check digit. */
const UNIT_CODE = `1234567${luhnCheckDigit('1234567')}`

beforeEach(() => {
  calls.length = 0
  queues.clear()
  resolvers.clear()
  jar.clear()
  catalogue.clear()
  variantRows.clear()
  giftCardRead = { data: [], error: null }
  cartWriteError = null
  catalogue.set(P1, product(P1))
  catalogue.set(P2, product(P2, { kenyon_price: 50 }))
  variantRows.set(V1, variant(V1, P1))

  for (const fn of [
    getUser,
    byCode,
    byUnitCode,
    checkRateLimit,
    getGuestSessionId,
    ensureGuestSessionId,
    rememberCartRow,
    forgetCartRow,
    readCartRowThrough,
    revalidatePath,
    logError,
    loadCartProductData,
  ]) {
    fn.mockReset()
  }
  createGuestCartClient.mockClear()
  cookieSet.mockClear()
  cookieDelete.mockClear()

  getUser.mockResolvedValue({ data: { user: { id: USER } } })
  byCode.mockResolvedValue({ data: null, error: null })
  byUnitCode.mockResolvedValue({ data: null, error: null })
  checkRateLimit.mockResolvedValue(true)
  getGuestSessionId.mockResolvedValue(null)
  ensureGuestSessionId.mockResolvedValue(GUEST)
  rememberCartRow.mockResolvedValue(undefined)
  forgetCartRow.mockResolvedValue(undefined)
  readCartRowThrough.mockImplementation(async (_scope, load: () => Promise<unknown>) => ({
    row: await load(),
    source: 'origin',
  }))
  loadCartProductData.mockImplementation(async (items: { product_id: string }[]) => ({
    products: [...catalogue.values()].filter((p) => items.some((i) => i.product_id === p.id)),
    variants: [...variantRows.values()],
  }))

  // Two readers share `public:products.select`: the gift-card probe (filtered
  // on is_gift_card) and the add-to-cart validator (filtered on id).
  resolvers.set('public:products.select', (record) => {
    if (chainArg(record, 'eq', 'is_gift_card') !== undefined) return giftCardRead
    const id = chainArg(record, 'eq', 'id') as string
    return { data: catalogue.get(id) ?? null, error: null }
  })
  resolvers.set('public:product_variants.select', (record) => ({
    data: variantRows.get(chainArg(record, 'eq', 'id') as string) ?? null,
    error: null,
  }))
  // Every cart write echoes the row it wrote, like `.select('id, items').single()`.
  for (const key of ['request:carts', 'guest:carts']) {
    resolvers.set(`${key}.update`, (record) =>
      cartWriteError
        ? { data: null, error: cartWriteError }
        : {
            data: {
              id: chainArg(record, 'eq', 'id'),
              items: (record.payload as { items: unknown }).items,
            },
            error: null,
          },
    )
    resolvers.set(`${key}.insert`, (record) =>
      cartWriteError
        ? { data: null, error: cartWriteError }
        : {
            data: { id: 'new-cart', items: (record.payload as { items: unknown }).items },
            error: null,
          },
    )
  }
})

// ── getCart ─────────────────────────────────────────────────────────────────

describe('getCart', () => {
  it('reads the account cart through the session store and prices it, no coupon lookups', async () => {
    userRow([item(P1, 2)])
    const cart = await getCart()
    expect(readCartRowThrough).toHaveBeenCalledWith(
      { kind: 'user', id: USER },
      expect.any(Function),
    )
    const [read] = find('request:carts', 'select')
    expect(read?.chain).toEqual([
      ['eq', ['profile_id', USER]],
      ['maybeSingle', []],
    ])
    expect(cart.id).toBe('user-cart')
    expect(cart.items).toHaveLength(1)
    // ₪100 × 2 in agorot, and 10% of it as the platform's cut.
    expect(cart.subtotal).toBe(20000)
    expect(cart.platform_fee).toBe(2000)
    expect(cart.total).toBe(20000)
    expect(cart.coupon).toBeNull()
    expect(cart.shipping?.method).toBe('supplier_delivery')
    expect(byCode).not.toHaveBeenCalled()
    expect(find('public:coupons', 'select')).toEqual([])
  })

  it('reads the guest cart under the session cookie, minting one when absent', async () => {
    signedOut()
    const cart = await getCart()
    expect(ensureGuestSessionId).toHaveBeenCalledTimes(1)
    expect(createGuestCartClient).toHaveBeenCalledWith(GUEST)
    expect(readCartRowThrough).toHaveBeenCalledWith(
      { kind: 'guest', id: GUEST },
      expect.any(Function),
    )
    const [read] = find('guest:carts', 'select')
    expect(read?.chain).toEqual([
      ['eq', ['session_id', GUEST]],
      ['is', ['profile_id', null]],
      ['maybeSingle', []],
    ])
    expect(cart).toMatchObject({ id: null, items: [], total: 0 })
    expect(find('request:carts', 'select')).toEqual([])
  })

  it('uses the existing guest cookie without minting another', async () => {
    signedOut()
    getGuestSessionId.mockResolvedValue('existing-guest')
    guestRow([item(P1)])
    const cart = await getCart()
    expect(ensureGuestSessionId).not.toHaveBeenCalled()
    expect(createGuestCartClient).toHaveBeenCalledWith('existing-guest')
    expect(cart.id).toBe('guest-cart')
  })

  it('rebuilds each stored line field by field and re-validates its percent', async () => {
    userRow([
      { product_id: P1, quantity: 1, platform_percent_snapshot: '250', stray: 'x' },
      { product_id: P2, quantity: 1, variant_id: null, platform_percent_snapshot: 7 },
      'junk',
      { product_id: 42, quantity: 1 },
      { product_id: P3, quantity: 'one' },
      null,
    ])
    const cart = await getCart()
    expect(loadCartProductData).toHaveBeenCalledWith([
      { product_id: P1, variant_id: null, quantity: 1, platform_percent_snapshot: null },
      { product_id: P2, variant_id: null, quantity: 1, platform_percent_snapshot: 7 },
    ])
    expect(cart.items.map((i) => i.platform_percent_snapshot)).toEqual([null, 7])
  })

  it('reads the shipping cookie and refuses to let it name a price', async () => {
    userRow([item(P1)])
    jar.set(CART_SHIPPING_COOKIE, 'pickup')
    expect((await getCart()).shipping).toEqual({
      method: 'pickup',
      label: 'איסוף עצמי מהספק',
      cost: 0,
    })
    jar.set(CART_SHIPPING_COOKIE, 'drone:999')
    expect((await getCart()).shipping?.method).toBe('supplier_delivery')
  })

  it('skips both code tables when nothing is payable', async () => {
    catalogue.set(P1, product(P1, { platform_percent: null }))
    userRow([item(P1)])
    jar.set(CART_COUPON_COOKIE, 'SAVE10')
    const cart = await getCart()
    expect(cart.subtotal).toBe(0)
    expect(cart.items[0]?.unavailable_reason).toBe('unpriced')
    expect(byCode).not.toHaveBeenCalled()
  })

  describe('with a code in the cookie', () => {
    beforeEach(() => userRow([item(P1, 2)]))

    it('prices a site-wide campaign first, capped at the commission that funds it', async () => {
      jar.set(CART_COUPON_COOKIE, ' save10 ')
      byCode.mockResolvedValue({ data: campaign('SAVE10', { percent_bp: 5000 }), error: null })
      const cart = await getCart()
      expect(byCode).toHaveBeenCalledWith('SAVE10')
      // 50% of 20000 would be 10000; the platform earns 2000, so that is the cap.
      expect(cart.coupon).toEqual({ code: 'SAVE10', label: '50%- הנחה', discount: 2000 })
      expect(cart.total).toBe(18000)
      expect(byUnitCode).not.toHaveBeenCalled()
      expect(find('public:coupons', 'select')).toEqual([])
    })

    it('resolves a printed unit code to its campaign and keeps the unit code as the identity', async () => {
      jar.set(CART_COUPON_COOKIE, UNIT_CODE)
      byUnitCode.mockResolvedValue({ data: campaign('PRINTED'), error: null })
      const cart = await getCart()
      expect(byCode).toHaveBeenCalledWith(UNIT_CODE)
      expect(byUnitCode).toHaveBeenCalledWith(UNIT_CODE)
      expect(cart.coupon).toMatchObject({ code: UNIT_CODE, discount: 2000 })
    })

    it('never looks up an 8-digit code that fails its check digit', async () => {
      jar.set(CART_COUPON_COOKIE, '12345670')
      await getCart()
      expect(byUnitCode).not.toHaveBeenCalled()
    })

    it('falls through a refused campaign to the legacy table, matched case-insensitively', async () => {
      jar.set(CART_COUPON_COOKIE, 'legacy5')
      byCode.mockResolvedValue({ data: campaign('LEGACY5', { is_active: false }), error: null })
      queue('public:coupons.select', {
        data: {
          id: 'c1',
          code: 'Legacy5',
          discount_type: 'fixed',
          discount_value: 5,
          min_purchase: null,
          expires_at: null,
          is_active: true,
          max_uses: null,
          used_count: 0,
          product_id: null,
        },
        error: null,
      })
      const cart = await getCart()
      const [read] = find('public:coupons', 'select')
      expect(read?.chain).toEqual([
        ['ilike', ['code', 'LEGACY5']],
        ['maybeSingle', []],
      ])
      // ₪5 in agorot; the label is the formatter's own (isolates, NBSP), not restated here.
      expect(cart.coupon).toMatchObject({ code: 'Legacy5', discount: 500 })
      expect(cart.coupon?.label).toMatch(/5.*₪.*הנחה/)
      expect(cart.total).toBe(19500)
    })

    it('renders no coupon for an unknown or lapsed code', async () => {
      jar.set(CART_COUPON_COOKIE, 'NOPE')
      expect((await getCart()).coupon).toBeNull()
    })

    it('takes no discount from either table when the cart holds a gift card', async () => {
      jar.set(CART_COUPON_COOKIE, 'SAVE10')
      byCode.mockResolvedValue({ data: campaign('SAVE10'), error: null })
      giftCardRead = { data: [{ id: P1 }], error: null }
      const cart = await getCart()
      expect(cart.coupon).toBeNull()
      const probe = find('public:products', 'select').find(
        (c) => chainArg(c, 'eq', 'is_gift_card') === true,
      )
      expect(probe?.chain).toContainEqual(['in', ['id', [P1]]])
      expect(find('public:coupons', 'select')).toEqual([])
    })

    it('treats a failed gift-card probe as no gift card', async () => {
      jar.set(CART_COUPON_COOKIE, 'SAVE10')
      byCode.mockResolvedValue({ data: campaign('SAVE10'), error: null })
      giftCardRead = { data: null, error: { code: '42703', message: 'no such column' } }
      expect((await getCart()).coupon).toMatchObject({ code: 'SAVE10' })
    })

    it('prices a stack of campaigns in order, each against what the last one left', async () => {
      jar.set(CART_COUPON_COOKIE, 'A|B')
      byCode.mockImplementation(async (code: string) => ({
        data:
          code === 'A'
            ? campaign('A', { percent_bp: 500 })
            : campaign('B', { kind: 'fixed', percent_bp: null, amount_agorot: 300 }),
        error: null,
      }))
      const cart = await getCart()
      expect(cart.coupon).toEqual({
        code: 'A+B',
        label: '5%- הנחה + הנחה',
        discount: 1300,
        stack: [
          { code: 'A', discountAgorot: 1000 },
          { code: 'B', discountAgorot: 300 },
        ],
      })
      expect(cart.total).toBe(18700)
    })

    it('collapses a stack with one surviving member to a single coupon', async () => {
      jar.set(CART_COUPON_COOKIE, 'A|GONE')
      byCode.mockImplementation(async (code: string) => ({
        data: code === 'A' ? campaign('A') : null,
        error: null,
      }))
      const cart = await getCart()
      expect(cart.coupon).toEqual({ code: 'A', label: '10%- הנחה', discount: 2000 })
      expect(cart.coupon?.stack).toBeUndefined()
    })

    it('renders no coupon when every member of the stack is refused, and reads at most three', async () => {
      jar.set(CART_COUPON_COOKIE, 'A|B|C|D')
      const cart = await getCart()
      expect(cart.coupon).toBeNull()
      expect(byCode).toHaveBeenCalledTimes(3)
      expect(byCode).not.toHaveBeenCalledWith('D')
    })
  })
})

// ── addToCart ───────────────────────────────────────────────────────────────

describe('addToCart', () => {
  it('refuses a malformed request before reading anything', async () => {
    expect(await addToCart('not-a-uuid')).toEqual({
      ok: false,
      error: 'מזהה לא תקין',
      code: 'VALIDATION',
    })
    expect(await addToCart(P1, null, 100)).toEqual({
      ok: false,
      error: 'כמות מקסימלית: 99',
      code: 'VALIDATION',
    })
    expect(calls).toEqual([])
  })

  it('is ceilinged per account, or per IP for a guest, before the catalogue is read', async () => {
    checkRateLimit.mockResolvedValue(false)
    expect(await addToCart(P1)).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(checkRateLimit).toHaveBeenCalledWith(`cart_write:user:${USER}`, 120, 3600)
    signedOut()
    expect(await addToCart(P1)).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(checkRateLimit).toHaveBeenCalledWith(`cart_write:ip:${IP}`, 120, 3600)
    expect(find('public:products', 'select')).toEqual([])
  })

  it('refuses a product that is missing, inactive, deleted or implausibly discounted', async () => {
    const unavailable = { ok: false, error: 'המוצר לא זמין', code: 'NOT_FOUND' }
    expect(await addToCart(P3)).toEqual(unavailable)
    catalogue.set(P1, product(P1, { status: 'draft' }))
    expect(await addToCart(P1)).toEqual(unavailable)
    catalogue.set(P1, product(P1, { deleted_at: '2026-01-01T00:00:00Z' }))
    expect(await addToCart(P1)).toEqual(unavailable)
    // ₪1 against a ₪400 compare-at is a data error, not an offer.
    catalogue.set(P1, product(P1, { kenyon_price: 1, full_price: 400 }))
    expect(await addToCart(P1)).toEqual(unavailable)
    expect(find('request:carts', 'insert')).toEqual([])
    expect(find('request:carts', 'update')).toEqual([])
  })

  it('refuses a variant that is missing, on another product, inactive or deleted', async () => {
    const invalid = { ok: false, error: 'גרסה לא תקינה', code: 'STATE_INVALID' }
    expect(await addToCart(P1, GUEST)).toEqual(invalid)
    variantRows.set(V1, variant(V1, P2))
    expect(await addToCart(P1, V1)).toEqual(invalid)
    variantRows.set(V1, variant(V1, P1, { is_active: false }))
    expect(await addToCart(P1, V1)).toEqual(invalid)
    variantRows.set(V1, variant(V1, P1, { deleted_at: '2026-01-01T00:00:00Z' }))
    expect(await addToCart(P1, V1)).toEqual(invalid)
  })

  it('refuses more than the shelf holds, on the variant or the product', async () => {
    const short = { ok: false, error: 'אין מספיק במלאי', code: 'INSUFFICIENT_STOCK' }
    expect(await addToCart(P1, V1, 4)).toEqual(short)
    expect(await addToCart(P1, null, 11)).toEqual(short)
    // A variant without its own count falls back to the product's.
    variantRows.set(V1, variant(V1, P1, { stock_quantity: null }))
    expect(await addToCart(P1, V1, 11)).toEqual(short)
    expect(await addToCart(P1, V1, 10)).toMatchObject({ ok: true })
  })

  it('inserts a guest cart with the server-read percent snapshot and remembers it', async () => {
    signedOut()
    const result = await addToCart(P1, V1, 2)
    expect(result).toMatchObject({ ok: true, cart: { id: 'new-cart', item_count: 2 } })

    const [insert] = find('guest:carts', 'insert')
    expect(insert?.payload).toEqual({
      session_id: GUEST,
      items: [{ product_id: P1, variant_id: V1, quantity: 2, platform_percent_snapshot: 10 }],
      expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
    expect(insert?.chain).toEqual([
      ['select', ['id, items']],
      ['single', []],
    ])
    expect(rememberCartRow).toHaveBeenCalledWith(
      { kind: 'guest', id: GUEST },
      { id: 'new-cart', items: insert?.payload && (insert.payload as { items: unknown }).items },
    )
    expect(revalidatePath).toHaveBeenCalledWith('/cart')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(find('request:carts', 'insert')).toEqual([])
  })

  it('inserts an account cart under the profile id', async () => {
    const result = await addToCart(P2)
    expect(result).toMatchObject({ ok: true })
    const [insert] = find('request:carts', 'insert')
    expect(insert?.payload).toMatchObject({ profile_id: USER, items: [item(P2)] })
    expect(rememberCartRow).toHaveBeenCalledWith({ kind: 'user', id: USER }, expect.anything())
  })

  it('adds onto an existing line, caps it at 99, and re-stamps the snapshot', async () => {
    catalogue.set(P1, product(P1, { stock_quantity: null, platform_percent: 12 }))
    userRow([{ ...item(P1, 98), platform_percent_snapshot: 5 }, item(P2)])
    const result = await addToCart(P1, null, 5)
    expect(result).toMatchObject({ ok: true, cart: { id: 'user-cart' } })
    const [update] = find('request:carts', 'update')
    expect(update?.payload).toMatchObject({
      items: [
        { product_id: P1, variant_id: null, quantity: 99, platform_percent_snapshot: 12 },
        item(P2),
      ],
    })
    expect(update?.chain).toEqual([
      ['eq', ['id', 'user-cart']],
      ['select', ['id, items']],
      ['single', []],
    ])
    expect(find('request:carts', 'insert')).toEqual([])
  })

  it('updates a guest cart in place when one exists', async () => {
    signedOut()
    guestRow([item(P2)])
    expect(await addToCart(P1)).toMatchObject({ ok: true, cart: { id: 'guest-cart' } })
    const [update] = find('guest:carts', 'update')
    expect(update?.payload).toMatchObject({ items: [item(P2), item(P1)] })
    expect(update?.chain).toContainEqual(['eq', ['id', 'guest-cart']])
  })

  it('checks the stock against the WHOLE line, not just the added quantity', async () => {
    userRow([item(P1, 8)])
    expect(await addToCart(P1, null, 5)).toEqual({
      ok: false,
      error: 'אין מספיק במלאי',
      code: 'INSUFFICIENT_STOCK',
    })
    expect(find('request:carts', 'update')).toEqual([])
  })

  it('surfaces a failed write rather than reporting a cart it did not save', async () => {
    cartWriteError = { code: '42501', message: 'rls' }
    await expect(addToCart(P1)).rejects.toEqual(cartWriteError)
    expect(rememberCartRow).not.toHaveBeenCalled()
    signedOut()
    await expect(addToCart(P1)).rejects.toEqual(cartWriteError)
    guestRow([item(P2)])
    await expect(addToCart(P1)).rejects.toEqual(cartWriteError)
    getUser.mockResolvedValue({ data: { user: { id: USER } } })
    userRow([item(P2)])
    await expect(addToCart(P1)).rejects.toEqual(cartWriteError)
  })

  it('throws instead of inserting a second row when the cart read fails', async () => {
    queue('request:carts.select', {
      data: null,
      error: { code: 'PGRST116', message: 'multiple (or no) rows returned' },
    })
    await expect(addToCart(P1)).rejects.toThrow('cart.row_read_failed: multiple')
    expect(logError).toHaveBeenCalledWith('cart.row_read_failed', expect.anything())
    expect(calls.filter((c) => c.op !== 'select')).toEqual([])
  })
})

// ── updateCartItem / removeFromCart ─────────────────────────────────────────

describe('updateCartItem', () => {
  it('refuses a malformed request, an empty cart, and a rate-limited caller in that order', async () => {
    expect(await updateCartItem(P1, null, -1)).toEqual({
      ok: false,
      error: 'כמות לא תקינה',
      code: 'VALIDATION',
    })
    expect(calls).toEqual([])
    expect(await updateCartItem(P1, null, 2)).toEqual({
      ok: false,
      error: 'העגלה ריקה',
      code: 'NOT_FOUND',
    })
    expect(checkRateLimit).not.toHaveBeenCalled()
    userRow([item(P1)])
    checkRateLimit.mockResolvedValue(false)
    expect(await updateCartItem(P1, null, 2)).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(find('request:carts', 'update')).toEqual([])
  })

  it('drops the line on quantity zero without consulting the catalogue', async () => {
    userRow([item(P1), item(P2), item(P1, 1, V1)])
    const result = await updateCartItem(P1, null, 0)
    expect(result).toMatchObject({ ok: true })
    const [update] = find('request:carts', 'update')
    expect(update?.payload).toMatchObject({ items: [item(P2), item(P1, 1, V1)] })
    expect(find('public:products', 'select').filter((c) => chainArg(c, 'eq', 'id'))).toEqual([])
  })

  it('re-validates the product for the new quantity', async () => {
    userRow([item(P1)])
    expect(await updateCartItem(P1, null, 11)).toEqual({
      ok: false,
      error: 'אין מספיק במלאי',
      code: 'INSUFFICIENT_STOCK',
    })
    expect(find('request:carts', 'update')).toEqual([])
  })

  it('refuses a line the cart does not hold', async () => {
    userRow([item(P1)])
    expect(await updateCartItem(P2, null, 1)).toEqual({
      ok: false,
      error: 'פריט לא נמצא בעגלה',
      code: 'NOT_FOUND',
    })
  })

  it('replaces the quantity of the named line and leaves the rest alone', async () => {
    userRow([item(P1), item(P2, 3)])
    const result = await updateCartItem(P2, null, 1)
    expect(result).toMatchObject({ ok: true, cart: { id: 'user-cart' } })
    const [update] = find('request:carts', 'update')
    expect(update?.payload).toMatchObject({ items: [item(P1), item(P2, 1)] })
    expect(revalidatePath).toHaveBeenCalledWith('/cart')
  })

  it('removeFromCart is an update to zero', async () => {
    userRow([item(P1)])
    expect(await removeFromCart(P1)).toMatchObject({ ok: true })
    expect(find('request:carts', 'update')[0]?.payload).toMatchObject({ items: [] })
  })
})

// ── removeUnavailableItems ──────────────────────────────────────────────────

describe('removeUnavailableItems', () => {
  it('succeeds with nothing to do on no cart, an empty cart, or a fully available one', async () => {
    expect(await removeUnavailableItems()).toMatchObject({ ok: true, cart: { id: null } })
    userRow([])
    expect(await removeUnavailableItems()).toMatchObject({ ok: true, cart: { id: 'user-cart' } })
    userRow([item(P1)])
    expect(await removeUnavailableItems()).toMatchObject({ ok: true, cart: { item_count: 1 } })
    expect(find('request:carts', 'update')).toEqual([])
    expect(checkRateLimit).not.toHaveBeenCalled()
  })

  it('drops the lines the pricer marks unavailable AND the ones it cannot render', async () => {
    catalogue.set(P2, product(P2, { stock_quantity: 0 }))
    // P3 is not in the catalogue at all: the pricer skips it silently.
    userRow([item(P1), item(P2), item(P3)])
    const result = await removeUnavailableItems()
    expect(result).toMatchObject({ ok: true, cart: { id: 'user-cart', item_count: 1 } })
    expect(checkRateLimit).toHaveBeenCalledWith(`cart_write:user:${USER}`, 120, 3600)
    const [update] = find('request:carts', 'update')
    expect(update?.payload).toMatchObject({ items: [item(P1)] })
    expect(update?.chain).toContainEqual(['eq', ['id', 'user-cart']])
  })

  it('is ceilinged only once there is something to write', async () => {
    catalogue.set(P2, product(P2, { stock_quantity: 0 }))
    userRow([item(P1), item(P2)])
    checkRateLimit.mockResolvedValue(false)
    expect(await removeUnavailableItems()).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(find('request:carts', 'update')).toEqual([])
  })
})

// ── clearCart ───────────────────────────────────────────────────────────────

describe('clearCart', () => {
  it('writes an empty list onto the existing row', async () => {
    userRow([item(P1), item(P2)])
    expect(await clearCart()).toMatchObject({ ok: true, cart: { id: 'user-cart', items: [] } })
    const [update] = find('request:carts', 'update')
    expect(update?.payload).toMatchObject({ items: [] })
    expect(update?.chain).toContainEqual(['eq', ['id', 'user-cart']])
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('succeeds with no row and refuses under the ceiling', async () => {
    expect(await clearCart()).toMatchObject({ ok: true, cart: { id: null, items: [] } })
    userRow([item(P1)])
    checkRateLimit.mockResolvedValue(false)
    expect(await clearCart()).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(find('request:carts', 'update')).toEqual([])
  })
})

// ── mergeGuestCart (the write half; the read half is in cart-merge-never-duplicates) ──

describe('mergeGuestCart', () => {
  it('sums shared lines capped at 99, deletes the guest row, and forgets both cache entries', async () => {
    guestRow([item(P1, 60), item(P3)])
    userRow([item(P1, 50), item(P2)])
    expect(await mergeGuestCart(requestClient as never, USER, GUEST)).toBe(true)

    const [update] = find('request:carts', 'update')
    expect(update?.payload).toEqual({ items: [item(P1, 99), item(P2), item(P3)] })
    expect(update?.chain).toEqual([['eq', ['id', 'user-cart']]])
    const [del] = find('guest:carts', 'delete')
    expect(del?.chain).toEqual([['eq', ['id', 'guest-cart']]])
    expect(forgetCartRow).toHaveBeenCalledWith({ kind: 'guest', id: GUEST })
    expect(forgetCartRow).toHaveBeenCalledWith({ kind: 'user', id: USER })
  })

  it('reports false and keeps the caches when the account write fails', async () => {
    guestRow([item(P1)])
    cartWriteError = { code: '23505', message: 'carts_profile_id_uidx' }
    expect(await mergeGuestCart(requestClient as never, USER, GUEST)).toBe(false)
    expect(logError).toHaveBeenCalledWith('cart.merge_write_failed', expect.anything())
    expect(forgetCartRow).not.toHaveBeenCalled()
  })

  it('still succeeds when only the guest delete fails, and says so in the log', async () => {
    guestRow([item(P1)])
    queue('guest:carts.delete', { data: null, error: { message: 'rls' } })
    expect(await mergeGuestCart(requestClient as never, USER, GUEST)).toBe(true)
    expect(logError).toHaveBeenCalledWith('cart.merge_guest_delete_failed', expect.anything())
    expect(forgetCartRow).toHaveBeenCalledTimes(2)
  })
})

describe('clearGuestSessionCookie', () => {
  it('deletes the guest cookie', async () => {
    await clearGuestSessionCookie()
    expect(cookieDelete).toHaveBeenCalledWith('ke_session_id')
  })
})

// ── applyCouponCode ─────────────────────────────────────────────────────────

describe('applyCouponCode', () => {
  const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/' }

  it('refuses a blank or oversized code before the limiter, and the limiter before the cart', async () => {
    expect(await applyCouponCode('   ')).toEqual({
      ok: false,
      error: 'יש להזין קוד קופון',
      code: 'VALIDATION',
    })
    expect(await applyCouponCode('X'.repeat(65))).toEqual({
      ok: false,
      error: 'קוד הקופון ארוך מדי',
      code: 'VALIDATION',
    })
    expect(checkRateLimit).not.toHaveBeenCalled()
    checkRateLimit.mockResolvedValue(false)
    expect(await applyCouponCode('SAVE10')).toEqual({
      ok: false,
      error: 'יותר מדי ניסיונות — נסו שוב מאוחר יותר',
      code: 'RATE_LIMITED',
    })
    expect(checkRateLimit).toHaveBeenCalledWith(`coupon:${IP}`)
    expect(calls).toEqual([])
  })

  it('refuses an empty cart before any code table is read', async () => {
    expect(await applyCouponCode('SAVE10')).toEqual({
      ok: false,
      error: 'העגלה ריקה',
      code: 'EMPTY_CART',
    })
    expect(byCode).not.toHaveBeenCalled()
  })

  it('writes the cookie only after a campaign priced against this cart, then re-reads', async () => {
    userRow([item(P1, 2)])
    byCode.mockResolvedValue({ data: campaign('SAVE10'), error: null })
    const result = await applyCouponCode(' save 10 ')
    expect(cookieSet).toHaveBeenCalledWith(CART_COUPON_COOKIE, 'SAVE10', COOKIE_OPTIONS)
    expect(revalidatePath).toHaveBeenCalledWith('/cart')
    expect(result).toMatchObject({ ok: true, cart: { coupon: { code: 'SAVE10', discount: 2000 } } })
    expect(find('public:coupons', 'select')).toEqual([])
  })

  it('refuses a code that is already in the cookie', async () => {
    userRow([item(P1)])
    jar.set(CART_COUPON_COOKIE, 'SAVE10')
    expect(await applyCouponCode('save10')).toEqual({
      ok: false,
      error: 'הקוד הזה כבר הופעל בעגלה',
      code: 'COUPON_INVALID',
    })
    expect(byCode).not.toHaveBeenCalled()
  })

  it('refuses a fourth code outright', async () => {
    userRow([item(P1)])
    jar.set(CART_COUPON_COOKIE, 'A|B|C')
    expect(await applyCouponCode('D')).toEqual({
      ok: false,
      error: 'ניתן לשלב עד שלושה קודים בהזמנה אחת',
      code: 'COUPON_INVALID',
    })
    expect(byCode).not.toHaveBeenCalled()
  })

  it('joins a stackable campaign onto the existing stack', async () => {
    userRow([item(P1, 2)])
    jar.set(CART_COUPON_COOKIE, 'A')
    byCode.mockImplementation(async (code: string) => ({
      data:
        code === 'A'
          ? campaign('A', { percent_bp: 500 })
          : campaign('B', { kind: 'fixed', percent_bp: null, amount_agorot: 300 }),
      error: null,
    }))
    const result = await applyCouponCode('B')
    expect(cookieSet).toHaveBeenCalledWith(CART_COUPON_COOKIE, 'A|B', COOKIE_OPTIONS)
    expect(result).toMatchObject({
      ok: true,
      cart: { coupon: { code: 'A+B', discount: 1300 } },
    })
  })

  it("reports the stacking engine's own refusal of the new code", async () => {
    userRow([item(P1, 2)])
    jar.set(CART_COUPON_COOKIE, 'A')
    byCode.mockImplementation(async (code: string) => ({
      data: code === 'A' ? campaign('A') : campaign('B', { allow_stacking: false }),
      error: null,
    }))
    expect(await applyCouponCode('B')).toEqual({
      ok: false,
      error: 'לא ניתן לצרף את הקוד הזה לקוד אחר',
      code: 'COUPON_INVALID',
    })
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('lets a valid new code REPLACE a cookie that no longer forms a stack', async () => {
    userRow([item(P1, 2)])
    // The existing code lapsed: the stack refuses IT, not the new one.
    jar.set(CART_COUPON_COOKIE, 'OLD')
    byCode.mockImplementation(async (code: string) => ({
      data: code === 'OLD' ? campaign('OLD', { is_active: false }) : campaign('NEW'),
      error: null,
    }))
    expect(await applyCouponCode('NEW')).toMatchObject({ ok: true })
    expect(cookieSet).toHaveBeenCalledWith(CART_COUPON_COOKIE, 'NEW', COOKIE_OPTIONS)

    // The existing code is a legacy coupon, not a campaign: same replacement.
    cookieSet.mockClear()
    jar.set(CART_COUPON_COOKIE, 'LEGACY5')
    byCode.mockImplementation(async (code: string) => ({
      data: code === 'NEW' ? campaign('NEW') : null,
      error: null,
    }))
    expect(await applyCouponCode('NEW')).toMatchObject({ ok: true })
    expect(cookieSet).toHaveBeenCalledWith(CART_COUPON_COOKIE, 'NEW', COOKIE_OPTIONS)
  })

  it('names the gift card as the reason rather than "unknown code"', async () => {
    userRow([item(P1)])
    byCode.mockResolvedValue({ data: campaign('SAVE10'), error: null })
    giftCardRead = { data: [{ id: P1 }], error: null }
    expect(await applyCouponCode('SAVE10')).toEqual({
      ok: false,
      error: 'לא ניתן להחיל קוד הנחה על עגלה עם גיפט קארד',
      code: 'COUPON_INVALID',
    })
    expect(find('public:coupons', 'select')).toEqual([])
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it("reports the legacy table's own reason for a refused code", async () => {
    userRow([item(P1)])
    expect(await applyCouponCode('NOPE')).toEqual({
      ok: false,
      error: 'קוד הקופון לא נמצא',
      code: 'COUPON_INVALID',
    })
    queue('public:coupons.select', {
      data: {
        id: 'c1',
        code: 'MIN500',
        discount_type: 'fixed',
        discount_value: 5,
        min_purchase: 500,
        expires_at: null,
        is_active: true,
        max_uses: null,
        used_count: 0,
        product_id: null,
      },
      error: null,
    })
    expect(await applyCouponCode('MIN500')).toEqual({
      ok: false,
      error: 'הסכום בעגלה נמוך מהמינימום לקוד הזה',
      code: 'COUPON_INVALID',
    })
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('applies a legacy coupon with the stored spelling, and prices the returned cart with it', async () => {
    userRow([item(P1, 2)])
    jar.set(CART_SHIPPING_COOKIE, 'pickup')
    queue('public:coupons.select', {
      data: {
        id: 'c1',
        code: 'Legacy5',
        discount_type: 'percent',
        discount_value: 5,
        min_purchase: null,
        expires_at: null,
        is_active: true,
        max_uses: null,
        used_count: 0,
        product_id: null,
      },
      error: null,
    })
    const result = await applyCouponCode('legacy5')
    expect(find('public:coupons', 'select')[0]?.chain).toContainEqual([
      'ilike',
      ['code', 'LEGACY5'],
    ])
    expect(cookieSet).toHaveBeenCalledWith(CART_COUPON_COOKIE, 'Legacy5', COOKIE_OPTIONS)
    expect(result).toMatchObject({
      ok: true,
      cart: {
        id: 'user-cart',
        coupon: { code: 'Legacy5', label: '5% הנחה', discount: 1000 },
        total: 19000,
        shipping: { method: 'pickup' },
      },
    })
  })
})

// ── setShippingMethod / removeCouponCode / resolveCheckoutDiscountAgorot ────

describe('setShippingMethod', () => {
  it('refuses an id the registry does not know, and records one it does', async () => {
    expect(await setShippingMethod('drone')).toEqual({
      ok: false,
      error: 'אופן משלוח לא מוכר',
      code: 'VALIDATION',
    })
    expect(cookieSet).not.toHaveBeenCalled()

    userRow([item(P1)])
    const result = await setShippingMethod('pickup')
    expect(cookieSet).toHaveBeenCalledWith(CART_SHIPPING_COOKIE, 'pickup', {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
    expect(result).toMatchObject({ ok: true, cart: { shipping: { method: 'pickup' } } })
    expect(revalidatePath).toHaveBeenCalledWith('/cart')
  })
})

describe('removeCouponCode', () => {
  it('deletes the cookie and returns the cart priced without it', async () => {
    userRow([item(P1)])
    jar.set(CART_COUPON_COOKIE, 'SAVE10')
    byCode.mockResolvedValue({ data: campaign('SAVE10'), error: null })
    const result = await removeCouponCode()
    expect(cookieDelete).toHaveBeenCalledWith(CART_COUPON_COOKIE)
    expect(result).toMatchObject({ ok: true, cart: { coupon: null } })
    expect(byCode).not.toHaveBeenCalled()
  })
})

describe('resolveCheckoutDiscountAgorot', () => {
  it('re-evaluates at the moment of charging, in agorot, with the stack when there is one', async () => {
    userRow([item(P1, 2)])
    expect(await resolveCheckoutDiscountAgorot()).toEqual({ code: null, discountAgorot: 0 })

    jar.set(CART_COUPON_COOKIE, 'SAVE10')
    byCode.mockResolvedValue({ data: campaign('SAVE10'), error: null })
    expect(await resolveCheckoutDiscountAgorot()).toEqual({ code: 'SAVE10', discountAgorot: 2000 })

    jar.set(CART_COUPON_COOKIE, 'A|B')
    byCode.mockImplementation(async (code: string) => ({
      data:
        code === 'A'
          ? campaign('A', { percent_bp: 500 })
          : campaign('B', { kind: 'fixed', percent_bp: null, amount_agorot: 300 }),
      error: null,
    }))
    expect(await resolveCheckoutDiscountAgorot()).toEqual({
      code: 'A+B',
      discountAgorot: 1300,
      stack: [
        { code: 'A', discountAgorot: 1000 },
        { code: 'B', discountAgorot: 300 },
      ],
    })
  })
})
