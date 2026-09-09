import { WISHLIST_MAX_ITEMS } from '@/lib/wishlist/guest-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The three wishlist behaviours that are wrong by default and silent when they
 * are wrong.
 *
 * 1. MOVE-TO-CART ORDER. Remove-then-add loses the save whenever the add is
 *    refused -- out of stock, delisted, over the per-line ceiling -- and the
 *    customer sees one button leave them with neither a cart line nor a
 *    wishlist row. Nothing errors on the remove, so nothing reports it.
 *
 * 2. THE CAP ON THE MERGE. The guest list is client-supplied. Without a cap
 *    taken against what the account ALREADY holds, a browser can put more than
 *    the ceiling into the table at login, and the toggle's own cap check then
 *    refuses every subsequent add forever.
 *
 * 3. 23505 ON THE INSERT IS TWO ANSWERS. See `runToggleWishlist`.
 */

type Result = { data: unknown; error: unknown; count?: number | null }

const scenario = {
  /**
   * Answers to the `.maybeSingle()` read that asks whether this product is
   * already saved. A QUEUE and not a single value, because the insert path
   * reads twice -- once before the insert and once to disambiguate 23505 -- and
   * those two reads are the whole point of that branch. The last entry repeats
   * once the queue runs dry.
   */
  existing: [{ data: null, error: null }] as Result[],
  /** The head+count read behind the cap. */
  count: { data: null, error: null, count: 0 } as Result,
  /** The `select('product_id')` list read, used by the merge and the id read. */
  rows: { data: [] as unknown[], error: null } as Result,
  insertError: null as unknown,
  deleteError: null as unknown,
}

const calls: { op: string; table: string; payload?: unknown }[] = []

function makeBuilder() {
  let table = ''
  let pending: Result | null = null
  let head = false
  const builder: Record<string, unknown> = {}

  for (const method of ['is', 'not', 'or', 'in', 'order', 'limit', 'range']) {
    builder[method] = () => builder
  }
  builder.eq = () => builder
  builder.single = () => builder
  builder.maybeSingle = () => {
    pending = (scenario.existing.length > 1 ? scenario.existing.shift() : scenario.existing[0]) ?? {
      data: null,
      error: null,
    }
    return builder
  }
  builder.from = (t: string) => {
    table = t
    pending = null
    head = false
    return builder
  }
  builder.select = (_cols: string, options?: { head?: boolean }) => {
    head = options?.head === true
    return builder
  }
  builder.insert = (payload: unknown) => {
    calls.push({ op: 'insert', table, payload })
    pending = { data: null, error: scenario.insertError }
    return builder
  }
  builder.upsert = (payload: unknown) => {
    calls.push({ op: 'upsert', table, payload })
    pending = { data: null, error: scenario.insertError }
    return builder
  }
  builder.delete = () => {
    calls.push({ op: 'delete', table })
    pending = { data: null, error: scenario.deleteError }
    return builder
  }
  // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is thenable
  builder.then = (resolve: (v: unknown) => unknown) => {
    if (pending) return resolve({ ...pending })
    if (head) return resolve({ ...scenario.count })
    return resolve({ ...scenario.rows })
  }
  return builder
}

const client = {
  from: (table: string) => (makeBuilder().from as (t: string) => unknown)(table),
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: async () => true,
  getClientIp: async () => '203.0.113.7',
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: async <T>(_name: string, run: () => Promise<T>) => run(),
}))

const addToCart = vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string })
vi.mock('@/server/actions/cart', () => ({
  addToCart: (...a: unknown[]) => addToCart(...(a as [])),
}))

const { toggleWishlist, moveWishlistItemToCart, mergeGuestWishlist, removeFromWishlist } =
  await import('./wishlist')

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'

function idAt(i: number): string {
  return `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`
}

beforeEach(() => {
  scenario.existing = [{ data: null, error: null }]
  scenario.count = { data: null, error: null, count: 0 }
  scenario.rows = { data: [], error: null }
  scenario.insertError = null
  scenario.deleteError = null
  calls.length = 0
  addToCart.mockClear()
  addToCart.mockResolvedValue({ ok: true })
})

describe('toggleWishlist', () => {
  it('refuses an id that is not a uuid before touching the database', async () => {
    expect(await toggleWishlist('../../etc/passwd')).toEqual({ ok: false, error: 'מוצר לא תקין.' })
    expect(calls).toHaveLength(0)
  })

  it('inserts when the product is not saved', async () => {
    const result = await toggleWishlist(P1)
    expect(result).toEqual({ ok: true, saved: true })
    expect(calls.map((c) => c.op)).toEqual(['insert'])
  })

  it('deletes when the product is already saved', async () => {
    scenario.existing = [{ data: { product_id: P1 }, error: null }]
    const result = await toggleWishlist(P1)
    expect(result).toEqual({ ok: true, saved: false })
    expect(calls.map((c) => c.op)).toEqual(['delete'])
  })

  it('refuses the add at the cap, and does not insert', async () => {
    scenario.count = { data: null, error: null, count: WISHLIST_MAX_ITEMS }
    const result = await toggleWishlist(P1)
    expect(result.ok).toBe(false)
    expect(result.error).toContain(String(WISHLIST_MAX_ITEMS))
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('still REMOVES at the cap: the ceiling is not a trap', async () => {
    scenario.existing = [{ data: { product_id: P1 }, error: null }]
    scenario.count = { data: null, error: null, count: WISHLIST_MAX_ITEMS }
    expect(await toggleWishlist(P1)).toEqual({ ok: true, saved: false })
  })

  /**
   * 23505 with a row behind it is a concurrent double-click and IS saved.
   * 23505 with nothing behind it is a soft-deleted row that the owner's SELECT
   * policy hides (migration 185), and reporting it as saved fills the heart
   * over a list that stays empty.
   */
  it('reports saved on 23505 when the re-read finds the row', async () => {
    scenario.insertError = { code: '23505' }
    // Empty for the pre-check, so the insert is attempted; the row for the
    // re-read, which is what a concurrent double-click leaves behind.
    scenario.existing = [
      { data: null, error: null },
      { data: { product_id: P1 }, error: null },
    ]
    const result = await toggleWishlist(P1)
    expect(result).toEqual({ ok: true, saved: true })
  })

  it('refuses on 23505 when the re-read finds nothing (the soft-deleted row)', async () => {
    scenario.insertError = { code: '23505' }
    const result = await toggleWishlist(P1)
    expect(result.ok).toBe(false)
    expect(result.saved).toBeUndefined()
  })
})

describe('moveWishlistItemToCart', () => {
  it('adds to the cart BEFORE it removes the save', async () => {
    await moveWishlistItemToCart(P1)
    expect(addToCart).toHaveBeenCalledWith(P1, null, 1)
    expect(calls.map((c) => c.op)).toEqual(['delete'])
  })

  /**
   * The one that matters. A refused add must leave the wishlist untouched, so
   * the customer keeps the save and can try again when stock returns.
   */
  it('keeps the save when the add is refused, and says why', async () => {
    addToCart.mockResolvedValue({ ok: false, error: 'אזל מהמלאי' })
    const result = await moveWishlistItemToCart(P1)
    expect(result).toEqual({ ok: false, error: 'אזל מהמלאי' })
    expect(calls).toHaveLength(0)
  })

  it('reports the half-done state rather than claiming success', async () => {
    scenario.deleteError = { code: '57014', message: 'statement timeout' }
    const result = await moveWishlistItemToCart(P1)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('נוסף לעגלה')
  })
})

describe('removeFromWishlist', () => {
  it('deletes without reading first: it is idempotent on purpose', async () => {
    expect(await removeFromWishlist(P1)).toEqual({ ok: true, saved: false })
    expect(calls.map((c) => c.op)).toEqual(['delete'])
  })
})

describe('mergeGuestWishlist', () => {
  it('writes nothing when the guest list is empty', async () => {
    const result = await mergeGuestWishlist([])
    expect(result.ok).toBe(true)
    expect(calls.some((c) => c.op === 'upsert')).toBe(false)
  })

  it('skips products the account already holds', async () => {
    scenario.rows = { data: [{ product_id: P1 }], error: null }
    await mergeGuestWishlist([P1, P2])
    const upsert = calls.find((c) => c.op === 'upsert')
    expect(upsert?.payload).toEqual([{ user_id: 'user-1', product_id: P2 }])
  })

  it('takes the cap against what the account already holds, not against the batch', async () => {
    // 99 saved leaves room for exactly one, however many the browser sends.
    scenario.rows = {
      data: Array.from({ length: WISHLIST_MAX_ITEMS - 1 }, (_, i) => ({ product_id: idAt(i) })),
      error: null,
    }
    await mergeGuestWishlist([P1, P2])
    const upsert = calls.find((c) => c.op === 'upsert')
    expect(upsert?.payload).toEqual([{ user_id: 'user-1', product_id: P1 }])
  })

  it('writes nothing when the account is already full', async () => {
    scenario.rows = {
      data: Array.from({ length: WISHLIST_MAX_ITEMS }, (_, i) => ({ product_id: idAt(i) })),
      error: null,
    }
    const result = await mergeGuestWishlist([P1, P2])
    expect(result.merged).toBe(0)
    expect(calls.some((c) => c.op === 'upsert')).toBe(false)
  })

  it('writes nothing when the read of the account list fails', async () => {
    // Same rule as mergeGuestCart: a failed read is not evidence of an empty
    // list, and treating it as one re-adds products the customer removed.
    scenario.rows = { data: null, error: { code: '57014' } }
    const result = await mergeGuestWishlist([P1])
    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.op === 'upsert')).toBe(false)
  })

  it('drops ids that are not uuids instead of sending them to the database', async () => {
    await mergeGuestWishlist([P1, 'nope', ''])
    const upsert = calls.find((c) => c.op === 'upsert')
    expect(upsert?.payload).toEqual([{ user_id: 'user-1', product_id: P1 }])
  })

  /**
   * `ok: false` on a failed upsert, never a throw: this runs on the login path
   * the same way `mergeGuestCart` does, and the provider only clears the
   * browser's copy on `ok`. A merge that reports failure is retried at the next
   * login; one that throws would take the sign-in down with it.
   */
  it('reports failure without throwing when the upsert fails', async () => {
    scenario.insertError = { code: '23503', message: 'foreign key violation' }
    const result = await mergeGuestWishlist([P1])
    expect(result.ok).toBe(false)
    expect(result.merged).toBe(0)
  })
})
