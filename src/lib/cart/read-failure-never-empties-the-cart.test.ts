import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A FAILED CATALOGUE READ MUST NOT DELETE THE SHOPPER'S CART.
 *
 * `loadCartProductData` discarded the `error` on both of its reads. The three
 * 2026-08-20 cycles before this one chased that same discard through the
 * `use cache` readers, where the cost is a cached empty grid. Here the cost is
 * a WRITE, and it is permanent:
 *
 *   1. the products read fails, `data` is null, `?? []` makes it an empty
 *      catalogue, and nothing is logged;
 *   2. `buildCartView` skips every line whose product it cannot find
 *      (`if (!product) continue`), so the priced cart renders NO items;
 *   3. `runRemoveUnavailableItems` treats "not in the priced view" as "this
 *      product no longer exists" - its own comment says so - and keeps only
 *      the rendered lines;
 *   4. `kept` is empty, `saveCartItems([])` runs, and the shopper's whole cart
 *      is gone from the database. The button they pressed said "remove the
 *      items that are unavailable".
 *
 * WHY THIS IS NOT ONLY REACHABLE WITH THE DATABASE DOWN, which would be caught
 * one line later: `readOptionalColumns` rethrows anything that is not 42703, so
 * a dead connection does abort before the write. The reachable case is a
 * failure specific to the MAIN select, and `load-products.ts` documents one
 * from this project's own history - a column named in `productSelect` that this
 * database does not have fails the whole query with 42703 while the narrow
 * probe selects beside it, which name three columns between them, still
 * succeed. A statement timeout on the wide `in (...)` read is the same shape.
 * That is the scenario reproduced below: the wide select fails, the probes do
 * not, and nothing throws.
 *
 * THE NEGATIVE CONTROLS ARE THE POINT. "Never writes" would be satisfied by a
 * cart that can no longer drop a genuinely deleted product, which is the whole
 * job of the button. So the same suite pins that a product that is really
 * absent still gets removed, and that a really empty result still prices
 * silently.
 */

// ── Scenario state, read by the fake PostgREST builders below ────────────────

type Result = { data: unknown; error: unknown }

const scenario = {
  /** Answer to the WIDE product select in `loadCartProductData`. */
  products: { data: [] as unknown, error: null as unknown } as Result,
  /** Answer to the variants select. */
  variants: { data: [] as unknown, error: null as unknown } as Result,
  /** What the `carts` row holds when the action reads it. */
  cartItems: [] as unknown[],
}

/** Every `items` payload written to `carts`, in order. */
const cartWrites: unknown[][] = []

/** The wide select is the only one that names these; the probes never do. */
const WIDE_SELECT_MARKER = 'kenyon_price'

/**
 * A thenable PostgREST builder. Awaiting a builder resolves it with no terminal
 * call, so a mock without `then` cannot reproduce these queries at all.
 */
function makeBuilder() {
  let table = ''
  let select = ''
  let pending: Result | null = null
  const builder: Record<string, unknown> = {}

  for (const method of ['eq', 'in', 'is', 'not', 'or', 'gte', 'lte', 'order', 'limit', 'range']) {
    builder[method] = () => builder
  }
  builder.single = () => builder
  builder.maybeSingle = () => builder
  builder.from = (t: string) => {
    table = t
    select = ''
    pending = null
    return builder
  }
  builder.select = (s?: string) => {
    select = s ?? ''
    return builder
  }
  const write = (payload: { items?: unknown[] }) => {
    if (table === 'carts') {
      cartWrites.push((payload.items ?? []) as unknown[])
      pending = { data: { id: 'cart-1', items: payload.items ?? [] }, error: null }
    }
    return builder
  }
  builder.update = write
  builder.insert = write
  // biome-ignore lint/suspicious/noThenProperty: see the comment above
  builder.then = (resolve: (v: unknown) => unknown) => {
    if (pending) return resolve({ ...pending })
    if (table === 'carts') return resolve({ data: { id: 'cart-1', items: scenario.cartItems } })
    if (table === 'product_variants') return resolve({ ...scenario.variants })
    if (table === 'products') {
      // The narrow probe selects (`readOptionalColumns`,
      // `readFirstAvailableColumn`) succeed with no rows: they are what makes
      // the wide read's failure survive to the write instead of rethrowing.
      return select.includes(WIDE_SELECT_MARKER)
        ? resolve({ ...scenario.products })
        : resolve({ data: [], error: null })
    }
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
  createPublicClient: () => makeBuilder(),
  createGuestCartClient: () => makeBuilder(),
}))
// NOT a spread of `makeBuilder()`: the builder carries a `then`, and an async
// function returning a thenable resolves it instead of handing it back, so the
// awaited value would be a query result with no `auth` on it at all.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => (makeBuilder().from as (t: string) => unknown)(table),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
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

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { loadCartProductData } = await import('./load-products')
const { removeUnavailableItems } = await import('@/server/actions/cart')

/** One sellable physical product, priced and with a percent set. */
function productRow(id: string) {
  return {
    id,
    slug: id,
    name_he: `מוצר ${id}`,
    type: 'physical',
    kenyon_price: 25,
    stock_quantity: null,
    status: 'active',
    deleted_at: null,
    images: [],
    is_coupon_enabled: false,
    platform_percent: 10,
  }
}

function cartItem(productId: string) {
  return { product_id: productId, variant_id: null, quantity: 1, platform_percent_snapshot: 10 }
}

beforeEach(() => {
  scenario.products = { data: [], error: null }
  scenario.variants = { data: [], error: null }
  scenario.cartItems = []
  cartWrites.length = 0
  logError.mockClear()
})

describe('loadCartProductData', () => {
  it('throws and logs once when the product read fails', async () => {
    scenario.products = { data: null, error: { code: '42703', message: 'column does not exist' } }
    await expect(loadCartProductData([cartItem('p-1')])).rejects.toThrow(/column does not exist/)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('throws and logs once when the variant read fails', async () => {
    scenario.products = { data: [productRow('p-1')], error: null }
    scenario.variants = { data: null, error: { code: '57014', message: 'statement timeout' } }
    await expect(loadCartProductData([{ ...cartItem('p-1'), variant_id: 'v-1' }])).rejects.toThrow(
      /statement timeout/,
    )
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('resolves empty and stays silent when the catalogue genuinely has no such rows', async () => {
    const loaded = await loadCartProductData([{ ...cartItem('p-1'), variant_id: 'v-1' }])
    expect(loaded).toEqual({ products: [], variants: [] })
    expect(logError).not.toHaveBeenCalled()
  })
})

describe('removeUnavailableItems', () => {
  it('does not empty the cart when the product read fails', async () => {
    scenario.cartItems = [cartItem('p-1'), cartItem('p-2')]
    scenario.products = { data: null, error: { code: '42703', message: 'column does not exist' } }

    await expect(removeUnavailableItems()).rejects.toThrow()
    expect(cartWrites, 'a failed read must never reach a write').toEqual([])
  })

  it('still removes a product that is genuinely gone from the catalogue', async () => {
    // The negative control: without it, "never writes" would pass a cart that
    // has simply stopped being able to remove anything.
    scenario.cartItems = [cartItem('p-1'), cartItem('p-2')]
    scenario.products = { data: [productRow('p-1')], error: null }

    const result = await removeUnavailableItems()

    expect(result.ok).toBe(true)
    expect(cartWrites).toHaveLength(1)
    expect((cartWrites[0] as { product_id: string }[]).map((i) => i.product_id)).toEqual(['p-1'])
  })

  it('writes nothing when every line is still sellable', async () => {
    scenario.cartItems = [cartItem('p-1'), cartItem('p-2')]
    scenario.products = { data: [productRow('p-1'), productRow('p-2')], error: null }

    const result = await removeUnavailableItems()

    expect(result.ok).toBe(true)
    expect(cartWrites).toEqual([])
  })
})
