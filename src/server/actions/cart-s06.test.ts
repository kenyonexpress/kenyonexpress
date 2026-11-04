import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S06: two server-side cart defects, each pinned where it lived.
 *
 * 1. `runMergeGuestCart` wrote the account cart and deleted the guest cart in
 *    one `Promise.all`, reading neither result. A failed account write still
 *    deleted the guest row, and the items being merged existed nowhere.
 * 2. `validateProductForCart` never read `products.max_per_order`. Measured
 *    04.11.2026: 44 active products carry one, and the cart sold up to 99.
 */

type Result = { data: unknown; error: unknown }

const scenario = {
  guestCart: { data: null, error: null } as Result,
  userCart: { data: null, error: null } as Result,
  /** What an account-side update/insert answers. */
  accountWrite: { data: null, error: null } as Result,
  product: null as Record<string, unknown> | null,
}

const writes: { op: string; kind: 'guest' | 'user'; items?: unknown[] }[] = []

function makeBuilder(kind: 'guest' | 'user') {
  let table = ''
  let pending: Result | null = null
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'is', 'eq', 'in', 'ilike', 'single', 'maybeSingle', 'limit']) {
    builder[m] = () => builder
  }
  builder.from = (t: string) => {
    table = t
    pending = null
    return builder
  }
  const write = (op: string) => (payload?: { items?: unknown[] }) => {
    writes.push({ op, kind, items: payload?.items })
    if (op === 'delete') pending = { data: null, error: null }
    else if (kind === 'user') pending = scenario.accountWrite
    else pending = { data: { id: 'guest-cart', items: payload?.items ?? [] }, error: null }
    return builder
  }
  builder.insert = write('insert')
  builder.update = write('update')
  builder.delete = write('delete')
  // biome-ignore lint/suspicious/noThenProperty: a thenable PostgREST builder
  builder.then = (resolve: (v: unknown) => unknown) => {
    if (pending) return resolve({ ...pending })
    if (table === 'carts') {
      return resolve({ ...(kind === 'guest' ? scenario.guestCart : scenario.userCart) })
    }
    if (table === 'products') return resolve({ data: scenario.product, error: null })
    return resolve({ data: null, error: null })
  }
  return builder
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock('@/lib/supabase/anon', () => ({
  createPublicClient: () => makeBuilder('user'),
  createGuestCartClient: () => makeBuilder('guest'),
}))
vi.mock('@/lib/cart/guest-session', () => ({
  GUEST_SESSION_COOKIE: 'ke_session_id',
  getGuestSessionId: async () => 'guest-1',
  ensureGuestSessionId: async () => 'guest-1',
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: async () => true,
  getClientIp: async () => '203.0.113.7',
}))
vi.mock('@/lib/commerce/phases', () => ({ assertTypeSellable: async () => true }))
vi.mock('@/lib/cart/load-products', () => ({
  loadCartProductData: async () => ({ products: [], variants: [] }),
}))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

/** Signed out: getCartRow takes the guest path. */
const accountClient = {
  from: (table: string) => (makeBuilder('user').from as (t: string) => unknown)(table),
  auth: { getUser: async () => ({ data: { user: null } }) },
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => accountClient }))

const { mergeGuestCart, addToCart, updateCartItem } = await import('./cart')

const P = '11111111-1111-4111-8111-111111111111'
const V1 = '22222222-2222-4222-8222-222222222222'
const V2 = '33333333-3333-4333-8333-333333333333'

function activeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: P,
    status: 'active',
    deleted_at: null,
    stock_quantity: 50,
    type: 'physical',
    is_coupon_enabled: false,
    platform_percent: 10,
    kenyon_price: 100,
    full_price: null,
    max_per_order: 5,
    ...overrides,
  }
}

beforeEach(() => {
  scenario.guestCart = {
    data: { id: 'guest-cart', items: [{ product_id: P, variant_id: null, quantity: 2 }] },
    error: null,
  }
  scenario.userCart = { data: null, error: null }
  scenario.accountWrite = { data: null, error: null }
  scenario.product = activeProduct()
  writes.length = 0
  logError.mockClear()
})

describe('mergeGuestCart keeps the guest cart until the account holds it', () => {
  const runMerge = () => mergeGuestCart(accountClient as never, 'user-1', 'guest-1')

  it('does not delete the guest row when the account insert fails', async () => {
    scenario.accountWrite = { data: null, error: { code: '42501', message: 'rls' } }

    expect(await runMerge()).toBe(false)
    expect(writes.map((w) => `${w.kind}:${w.op}`)).toEqual(['user:insert'])
    expect(logError).toHaveBeenCalledWith('cart.merge_write_failed', expect.anything())
  })

  it('does not delete the guest row when the account update fails', async () => {
    scenario.userCart = { data: { id: 'user-cart', items: [] }, error: null }
    scenario.accountWrite = { data: null, error: { code: '57014', message: 'timeout' } }

    expect(await runMerge()).toBe(false)
    expect(writes.map((w) => `${w.kind}:${w.op}`)).toEqual(['user:update'])
  })

  it('writes the account first, then deletes the guest row, on success', async () => {
    expect(await runMerge()).toBe(true)
    expect(writes.map((w) => `${w.kind}:${w.op}`)).toEqual(['user:insert', 'guest:delete'])
  })
})

describe('addToCart enforces max_per_order', () => {
  it('refuses an add above the limit', async () => {
    scenario.guestCart = { data: null, error: null }
    const res = await addToCart(P, null, 6)
    expect(res).toEqual({
      ok: false,
      error: 'ניתן להזמין עד 5 יחידות מהמוצר',
      code: 'MAX_PER_ORDER',
    })
    expect(writes).toEqual([])
  })

  it('refuses an add that pushes an existing line over the limit', async () => {
    scenario.guestCart = {
      data: { id: 'guest-cart', items: [{ product_id: P, variant_id: null, quantity: 4 }] },
      error: null,
    }
    const res = await addToCart(P, null, 2)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('MAX_PER_ORDER')
    expect(writes).toEqual([])
  })

  it('counts the product across its variant lines', async () => {
    // Variants resolve through the same products-table stub; give them one.
    scenario.product = activeProduct()
    scenario.guestCart = {
      data: { id: 'guest-cart', items: [{ product_id: P, variant_id: V1, quantity: 4 }] },
      error: null,
    }
    const res = await updateCartItem(P, V2, 2)
    // V2 is not in the cart, but the limit is decided before that: 4 + 2 > 5.
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('MAX_PER_ORDER')
  })

  it('accepts an add exactly at the limit', async () => {
    scenario.guestCart = { data: null, error: null }
    const res = await addToCart(P, null, 5)
    expect(res.ok).toBe(true)
    expect(writes.map((w) => `${w.kind}:${w.op}`)).toEqual(['guest:insert'])
  })

  it('ignores a null limit', async () => {
    scenario.guestCart = { data: null, error: null }
    scenario.product = activeProduct({ max_per_order: null })
    const res = await addToCart(P, null, 40)
    expect(res.ok).toBe(true)
  })
})
