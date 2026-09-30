import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of reviews and the wishlist. Both run on the USER client
 * on purpose (the RLS policies are the enforcement), so what can only fail
 * here is the translation: which refusal code becomes which Hebrew sentence,
 * that an unauthenticated or rate-limited caller stops before any write, and
 * that the 23505 re-read distinguishes "already saved" from "soft-deleted".
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

function override(key: string, result: Result): void {
  queues.set(key, [result])
}

function settle(key: string): Result {
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
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
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

const getUser = vi.fn()
const requestClient = { ...fakeClient('request'), auth: { getUser: () => getUser() } }
const checkRateLimit = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222'
const ITEM_ID = '33333333-3333-4333-8333-333333333333'
const ITEM_2 = '44444444-4444-4444-8444-444444444444'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

const { submitReview, toggleWishlist, getWishlistSaved, getMyReviewableItem } = await import(
  './reviews'
)

beforeEach(() => {
  calls.length = 0
  queues.clear()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  checkRateLimit.mockReset()
  checkRateLimit.mockResolvedValue(true)
  revalidatePath.mockReset()
})

describe('submitReview', () => {
  const valid = { productId: PRODUCT_ID, orderItemId: ITEM_ID, rating: '4', body: '  מעולה  ' }

  it('inserts the review on the user client, trimmed, and keyed on the purchase', async () => {
    expect(await submitReview(form(valid))).toEqual({ ok: true })
    const insert = find('request:reviews', 'insert')
    expect(insert?.payload).toEqual({
      product_id: PRODUCT_ID,
      user_id: USER_ID,
      order_item_id: ITEM_ID,
      rating: 4,
      body: 'מעולה',
    })
    expect(checkRateLimit).toHaveBeenCalledWith(`review-submit:${USER_ID}`, 5, 3600)
  })

  it('stores an empty body as null', async () => {
    await submitReview(form({ ...valid, body: '   ' }))
    expect(find('request:reviews', 'insert')?.payload).toMatchObject({ body: null })
  })

  it('refuses a signed-out or rate-limited caller before any write', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await submitReview(form(valid))).toEqual({
      ok: false,
      error: 'צריך להתחבר כדי לכתוב ביקורת.',
    })
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    checkRateLimit.mockResolvedValue(false)
    expect(await submitReview(form(valid))).toEqual({
      ok: false,
      error: 'יותר מדי ביקורות בשעה האחרונה. נסה שוב מאוחר יותר.',
    })
    expect(calls).toEqual([])
  })

  it('rejects an out-of-range rating with the schema message', async () => {
    expect(await submitReview(form({ ...valid, rating: '7' }))).toEqual({
      ok: false,
      error: 'דירוג בין 1 ל-5',
    })
    expect(calls).toEqual([])
  })

  it('translates each policy refusal into its own sentence', async () => {
    const cases: [string, string][] = [
      ['42501', 'ביקורת אפשר לכתוב רק על מוצר שרכשת.'],
      ['23505', 'כבר כתבת ביקורת על הרכישה הזו.'],
      ['PGRST205', 'הביקורות עוד לא פתוחות. נסה שוב בקרוב.'],
      ['XX000', 'שמירת הביקורת נכשלה. נסה שוב.'],
    ]
    for (const [code, message] of cases) {
      override('request:reviews.insert', { data: null, error: { code, message: 'refused' } })
      expect(await submitReview(form(valid))).toEqual({ ok: false, error: message })
    }
  })
})

describe('toggleWishlist', () => {
  it('refuses a malformed id before touching the session', async () => {
    expect(await toggleWishlist('nope')).toEqual({ ok: false, error: 'מוצר לא תקין.' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('refuses a signed-out or rate-limited caller before any read', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({
      ok: false,
      error: 'צריך להתחבר כדי לשמור מוצרים.',
      reason: 'signed_out',
    })
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    checkRateLimit.mockResolvedValue(false)
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({
      ok: false,
      error: 'יותר מדי פעולות. נסה שוב בעוד רגע.',
    })
    expect(calls).toEqual([])
  })

  it('answers "not open yet" for a missing table and a generic line otherwise', async () => {
    override('request:wishlists.select', { data: null, error: { code: 'PGRST205' } })
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({
      ok: false,
      error: 'רשימת המשאלות עוד לא פתוחה.',
    })
    override('request:wishlists.select', { data: null, error: { code: '57014' } })
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({ ok: false, error: 'הפעולה נכשלה. נסה שוב.' })
  })

  it('removes an existing row, scoped to the owner, and revalidates', async () => {
    override('request:wishlists.select', { data: { product_id: PRODUCT_ID }, error: null })
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({ ok: true, saved: false })
    const del = find('request:wishlists', 'delete')
    expect(del?.chain).toContainEqual(['eq', ['product_id', PRODUCT_ID]])
    expect(del?.chain).toContainEqual(['eq', ['user_id', USER_ID]])
    expect(revalidatePath).toHaveBeenCalledWith('/wishlist')
  })

  it('reports a failed delete', async () => {
    override('request:wishlists.select', { data: { product_id: PRODUCT_ID }, error: null })
    override('request:wishlists.delete', { data: null, error: { code: '57014' } })
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({ ok: false, error: 'הפעולה נכשלה. נסה שוב.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('inserts a new row for the caller and revalidates', async () => {
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({ ok: true, saved: true })
    expect(find('request:wishlists', 'insert')?.payload).toEqual({
      user_id: USER_ID,
      product_id: PRODUCT_ID,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/wishlist')
  })

  it('reports a failed insert that is not a unique violation', async () => {
    override('request:wishlists.insert', { data: null, error: { code: '57014' } })
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({ ok: false, error: 'הפעולה נכשלה. נסה שוב.' })
  })

  it('treats 23505 as "already saved" only when the re-read sees the row', async () => {
    // First read: nothing (so the insert runs); re-read after 23505: the live row.
    queue(
      'request:wishlists.select',
      { data: null, error: null },
      { data: { product_id: PRODUCT_ID }, error: null },
    )
    override('request:wishlists.insert', { data: null, error: { code: '23505' } })
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({ ok: true, saved: true })
  })

  it('refuses to report a save it cannot prove after 23505', async () => {
    // Soft-deleted row: the insert collides, the re-read (185's SELECT) sees nothing.
    override('request:wishlists.insert', { data: null, error: { code: '23505' } })
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({ ok: false, error: 'הפעולה נכשלה. נסה שוב.' })
    // A failed re-read proves nothing either.
    queue(
      'request:wishlists.select',
      { data: null, error: null },
      { data: null, error: { code: '57014' } },
    )
    expect(await toggleWishlist(PRODUCT_ID)).toEqual({ ok: false, error: 'הפעולה נכשלה. נסה שוב.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('getWishlistSaved', () => {
  it('is false when signed out, false on a failed read, true on a row', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await getWishlistSaved(PRODUCT_ID)).toBe(false)
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    override('request:wishlists.select', { data: null, error: { code: '57014' } })
    expect(await getWishlistSaved(PRODUCT_ID)).toBe(false)
    override('request:wishlists.select', { data: { product_id: PRODUCT_ID }, error: null })
    expect(await getWishlistSaved(PRODUCT_ID)).toBe(true)
  })
})

describe('getMyReviewableItem', () => {
  it('answers null for a malformed id, a signed-out caller, and no purchases', async () => {
    expect(await getMyReviewableItem('nope')).toBeNull()
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await getMyReviewableItem(PRODUCT_ID)).toBeNull()
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    override('request:order_items.select', { data: [], error: null })
    expect(await getMyReviewableItem(PRODUCT_ID)).toBeNull()
    override('request:order_items.select', { data: null, error: { code: '57014' } })
    expect(await getMyReviewableItem(PRODUCT_ID)).toBeNull()
  })

  it('answers null when the reviews table cannot be read', async () => {
    override('request:order_items.select', { data: [{ id: ITEM_ID }], error: null })
    override('request:reviews.select', { data: null, error: { code: 'PGRST205' } })
    expect(await getMyReviewableItem(PRODUCT_ID)).toBeNull()
  })

  it('returns the first purchase that has no review yet, or null when all are spent', async () => {
    override('request:order_items.select', {
      data: [{ id: ITEM_ID }, { id: ITEM_2 }],
      error: null,
    })
    override('request:reviews.select', { data: [{ order_item_id: ITEM_ID }], error: null })
    expect(await getMyReviewableItem(PRODUCT_ID)).toEqual({ orderItemId: ITEM_2 })
    const items = find('request:order_items', 'select')
    expect(items?.chain).toContainEqual(['eq', ['orders.user_id', USER_ID]])

    override('request:reviews.select', {
      data: [{ order_item_id: ITEM_ID }, { order_item_id: ITEM_2 }],
      error: null,
    })
    expect(await getMyReviewableItem(PRODUCT_ID)).toBeNull()
  })
})
