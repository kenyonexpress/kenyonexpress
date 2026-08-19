import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * LOGIN MUST NOT TURN A FAILED READ INTO A SECOND CART ROW.
 *
 * `runMergeGuestCart` read the account's cart with `const { data: userCart }`
 * and discarded the error, and every branch below that read treats "no id" as
 * "this account has no cart yet":
 *
 *   1. the account cart read fails, `userCart` is null, and nothing is logged;
 *   2. `userCart?.id` is null, so the write takes the INSERT branch;
 *   3. `public.carts` has no unique index on `profile_id` - measured against
 *      production on 2026-08-20: carts_pkey on id, carts_profile_id_fkey,
 *      carts_owner_check, and a NON-unique carts_profile_id_idx - so the
 *      insert succeeds and the profile now owns two cart rows;
 *   4. the guest cart is deleted in the same `Promise.all`, unconditionally,
 *      so the items that were about to be merged are gone;
 *   5. from then on `getCartRow` runs `.eq('profile_id', ...).maybeSingle()`
 *      against two rows. postgrest-js synthesises PGRST116 for that case
 *      (`dist/index.mjs`: `if (isMaybeSingle && Array.isArray(data)) if
 *      (data.length > 1)`), `getCartRow` discards it too, and the account cart
 *      reads EMPTY on every request from then on - while each write, seeing no
 *      existing id, inserts yet another row.
 *
 * One transient read at login, and the cart is permanently empty. Measured on
 * production the same day: 1,808 cart rows, 1 of them owned by an account, 0
 * profiles with duplicates. The trap has not fired yet; it is being closed
 * before launch rather than cleaned up after.
 *
 * WHY THE MERGE RETURNS A BOOLEAN INSTEAD OF THROWING. All three call sites are
 * on the login path - the OAuth callback, password sign-in and phone OTP verify
 * - and all three run after the session has already been exchanged. An exception there fails a login that
 * has otherwise succeeded, which is worse than a cart that did not merge. So a
 * failed read does nothing at all - no insert, no delete - and says so, and the
 * caller keeps the guest cookie, which is what lets the merge be retried on the
 * next login instead of orphaning the guest cart.
 *
 * WHY `getCartRow` DOES throw. It is not on the login path, its callers all
 * handle a rejection already (the cart store rolls back, `CartBootstrap` keeps
 * the locally persisted mirror on `!res.ok`), and the alternative is the step-5
 * state above: an empty cart presented as fact, forever, with no log line.
 */

type Result = { data: unknown; error: unknown }

const scenario = {
  /** The guest cart row, or the failure of the read for it. */
  guestCart: { data: { id: 'guest-cart', items: [] as unknown[] }, error: null } as Result,
  /** The account cart row, or the failure of the read for it. */
  userCart: { data: null, error: null } as Result,
}

const writes: { op: string; table: string; items?: unknown[] }[] = []

/**
 * A thenable PostgREST builder. Awaiting one resolves it with no terminal call,
 * so a mock without `then` cannot reproduce these queries at all. Which of the
 * two `carts` reads it is answering is decided by the filter column, the same
 * way the real policies tell them apart.
 */
function makeBuilder(kind: 'guest' | 'user') {
  let table = ''
  let pending: Result | null = null
  const builder: Record<string, unknown> = {}

  for (const method of ['select', 'is', 'not', 'or', 'gte', 'lte', 'order', 'limit', 'range']) {
    builder[method] = () => builder
  }
  builder.eq = () => builder
  builder.single = () => builder
  builder.maybeSingle = () => builder
  builder.from = (t: string) => {
    table = t
    pending = null
    return builder
  }
  builder.insert = (payload: { items?: unknown[] }) => {
    writes.push({ op: 'insert', table, items: payload.items })
    pending = { data: { id: 'new-cart', items: payload.items ?? [] }, error: null }
    return builder
  }
  builder.update = (payload: { items?: unknown[] }) => {
    writes.push({ op: 'update', table, items: payload.items })
    pending = { data: { id: 'user-cart', items: payload.items ?? [] }, error: null }
    return builder
  }
  builder.delete = () => {
    writes.push({ op: 'delete', table })
    pending = { data: null, error: null }
    return builder
  }
  // biome-ignore lint/suspicious/noThenProperty: see the comment above
  builder.then = (resolve: (v: unknown) => unknown) => {
    if (pending) return resolve({ ...pending })
    if (table === 'carts') {
      return resolve({ ...(kind === 'guest' ? scenario.guestCart : scenario.userCart) })
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

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// The account client the callers already hold. Not a spread of the builder: it
// carries a `then`, and an async function returning a thenable resolves it
// instead of handing it back.
const accountClient = {
  from: (table: string) => (makeBuilder('user').from as (t: string) => unknown)(table),
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => accountClient }))

const { mergeGuestCart, getCart } = await import('./cart')

function guestItems() {
  return [{ product_id: 'p-1', variant_id: null, quantity: 2, platform_percent_snapshot: 10 }]
}

/** postgrest-js synthesises exactly this when `.maybeSingle()` sees two rows. */
const DUPLICATE_ROWS = {
  code: 'PGRST116',
  details: 'Results contain 2 rows, application/vnd.pgrst.object+json requires 1 row',
  message: 'JSON object requested, multiple (or no) rows returned',
}

beforeEach(() => {
  scenario.guestCart = { data: { id: 'guest-cart', items: guestItems() }, error: null }
  scenario.userCart = { data: null, error: null }
  writes.length = 0
  logError.mockClear()
})

const runMerge = () => mergeGuestCart(accountClient as never, 'user-1', 'guest-1')

describe('mergeGuestCart when a cart read fails', () => {
  it('writes nothing at all when the account cart read fails', async () => {
    scenario.userCart = { data: null, error: { code: '57014', message: 'statement timeout' } }

    const merged = await runMerge()

    expect(merged, 'the caller must be told the guest cookie is still needed').toBe(false)
    expect(writes, 'no insert may duplicate the row, no delete may drop the guest cart').toEqual([])
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('writes nothing at all when the guest cart read fails', async () => {
    scenario.guestCart = { data: null, error: { code: '57014', message: 'statement timeout' } }

    const merged = await runMerge()

    expect(merged).toBe(false)
    expect(writes).toEqual([])
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('refuses a duplicate account row rather than adding a third', async () => {
    scenario.userCart = { data: null, error: DUPLICATE_ROWS }

    const merged = await runMerge()

    expect(merged).toBe(false)
    expect(writes).toEqual([])
  })
})

describe('mergeGuestCart on the paths that must keep working', () => {
  it('updates the account cart in place when it already has one', async () => {
    scenario.userCart = { data: { id: 'user-cart', items: [] }, error: null }

    const merged = await runMerge()

    expect(merged).toBe(true)
    expect(writes.map((w) => w.op)).toEqual(['update', 'delete'])
    expect(logError).not.toHaveBeenCalled()
  })

  it('inserts one cart when the account genuinely has none', async () => {
    // The negative control that matters: a real "no rows" answer still takes
    // the insert branch, so refusing to insert on an ERROR is not the same as
    // refusing to insert at all.
    scenario.userCart = { data: null, error: null }

    const merged = await runMerge()

    expect(merged).toBe(true)
    expect(writes.map((w) => w.op)).toEqual(['insert', 'delete'])
    expect(writes[0]?.items).toHaveLength(1)
  })

  it('does nothing and reports success when the guest cart is empty', async () => {
    scenario.guestCart = { data: { id: 'guest-cart', items: [] }, error: null }

    const merged = await runMerge()

    expect(merged, 'nothing to merge is not a failure to merge').toBe(true)
    expect(writes).toEqual([])
  })
})

describe('getCart when the cart row cannot be read', () => {
  it('throws instead of presenting an empty cart, on a duplicate row', async () => {
    scenario.userCart = { data: null, error: DUPLICATE_ROWS }
    await expect(getCart()).rejects.toThrow(/multiple/)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('resolves an empty cart, silently, when the account genuinely has none', async () => {
    scenario.userCart = { data: null, error: null }
    const cart = await getCart()
    expect(cart.items).toEqual([])
    expect(cart.id).toBeNull()
    expect(logError).not.toHaveBeenCalled()
  })
})

/**
 * THE SCAN, because the fix above is only half of it.
 *
 * `mergeGuestCart` returning false is worth nothing if a caller clears the
 * guest cookie anyway - the cart it protects is findable by that cookie and by
 * nothing else. There were THREE call sites, not the two the first grep of this
 * cycle found: the OAuth callback, password sign-in, and phone OTP verify. The
 * third was reached only by re-grepping after the first two were patched, which
 * is the same "the sweep is the fix, not the file" lesson the cached-reader
 * cycles wrote down twice. A fourth login path is a normal thing to add; this
 * fails the moment one clears the cookie without asking.
 */
describe('every login path that merges', () => {
  const CALLERS = ['src/app/auth/callback/route.ts', 'src/server/actions/auth.ts']

  it('gates the guest cookie delete on the merge having run', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')

    for (const rel of CALLERS) {
      const source = readFileSync(join(process.cwd(), rel), 'utf8')
      const calls = source.match(/await mergeGuestCart\(/g) ?? []
      const gated = source.match(/const merged = await mergeGuestCart\(/g) ?? []
      expect(calls.length, `${rel} must call the merge`).toBeGreaterThan(0)
      expect(gated.length, `${rel}: every call keeps its answer`).toBe(calls.length)
      expect(
        source.includes('cookieStore.delete(GUEST_SESSION_COOKIE)') &&
          !/if \(merged\)/.test(source),
        `${rel}: the cookie delete must be behind the merge's answer`,
      ).toBe(false)
    }
  })
})
