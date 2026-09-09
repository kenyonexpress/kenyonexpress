import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ONE REVIEW PER CUSTOMER PER PRODUCT, AND A HEADLINE THAT CANNOT BE LOST.
 *
 * TWO RULES MEET HERE AND THEY ARE NOT THE SAME RULE. 154 constrains
 * `order_item_id UNIQUE`: one review per purchased LINE, which it states as the
 * intent -- "buying twice earns two review slots". SECTIONS 25 asks for one per
 * user per PRODUCT. `pending/189` is the index that makes the database hold
 * that; these tests hold the application half, which is what is live today.
 *
 * The regression they exist for is silent in exactly the way that matters: the
 * old `getMyReviewableItem` looked for an unspent ORDER ITEM, so a customer who
 * bought the same product twice was offered the form a second time, wrote a
 * second review, and it was accepted. Nothing failed. The product simply
 * carried two ratings from one person, which is what an aggregate rating is
 * least able to survive.
 *
 * THE TITLE HALF is about a column that does not exist yet. Naming `title` in a
 * select or an insert against a database without it fails the WHOLE statement
 * with 42703 -- not the field, the statement. Untreated that is an empty
 * moderation queue, an empty review list, or a review that vanishes on submit.
 */

type Result = { data: unknown; error: unknown }

const scenario = {
  /** The buyer's paid order_items for this product. */
  orderItems: { data: [{ id: 'oi-1', order_id: 'o-1' }], error: null } as Result,
  /** The `select('id, title')` probe: their existing reviews for this product. */
  myReviews: { data: [] as unknown[], error: null } as Result,
  /** The same read retried without `title`, used only on the 42703 path. */
  myReviewsNoTitle: { data: [] as unknown[], error: null } as Result,
  insertError: null as unknown,
  /** Set when the insert names `title`; the retry clears it. */
  insertErrorWithTitle: null as unknown,
}

const inserts: Record<string, unknown>[] = []
const selects: string[] = []
/** Every `.eq(column, value)` the code applied, so a filter can be asserted absent. */
const filters: [string, unknown][] = []

function makeBuilder() {
  let table = ''
  let columns = ''
  let pending: Result | null = null
  const builder: Record<string, unknown> = {}

  for (const method of ['is', 'not', 'or', 'order', 'maybeSingle', 'single']) {
    builder[method] = () => builder
  }
  builder.eq = (column: string, value: unknown) => {
    filters.push([column, value])
    return builder
  }
  builder.in = () => builder
  builder.limit = () => builder
  builder.from = (t: string) => {
    table = t
    pending = null
    return builder
  }
  builder.select = (cols: string) => {
    columns = cols
    selects.push(cols)
    return builder
  }
  builder.insert = (payload: Record<string, unknown>) => {
    inserts.push(payload)
    const named = Object.hasOwn(payload, 'title')
    pending = {
      data: null,
      error: named ? (scenario.insertErrorWithTitle ?? scenario.insertError) : scenario.insertError,
    }
    return builder
  }
  // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is thenable
  builder.then = (resolve: (v: unknown) => unknown) => {
    if (pending) return resolve({ ...pending })
    if (table === 'order_items') return resolve({ ...scenario.orderItems })
    if (table === 'reviews') {
      return resolve({
        ...(columns.includes('title') ? scenario.myReviews : scenario.myReviewsNoTitle),
      })
    }
    return resolve({ data: null, error: null })
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

const { submitReview, getMyReviewableItem } = await import('./reviews')

const PRODUCT = '11111111-1111-4111-8111-111111111111'
const ORDER_ITEM = '22222222-2222-4222-8222-222222222222'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

const valid = () =>
  form({ productId: PRODUCT, orderItemId: ORDER_ITEM, rating: '5', body: 'מוצר טוב' })

beforeEach(() => {
  scenario.orderItems = { data: [{ id: 'oi-1', order_id: 'o-1' }], error: null }
  scenario.myReviews = { data: [], error: null }
  scenario.myReviewsNoTitle = { data: [], error: null }
  scenario.insertError = null
  scenario.insertErrorWithTitle = null
  inserts.length = 0
  selects.length = 0
  filters.length = 0
})

describe('getMyReviewableItem', () => {
  it('offers the form to a verified buyer who has not reviewed the product', async () => {
    expect(await getMyReviewableItem(PRODUCT)).toEqual({
      orderItemId: 'oi-1',
      titleSupported: true,
    })
  })

  /**
   * The regression. Two purchases, one review already written: the old version
   * found the SECOND purchase unspent and offered the form again.
   */
  it('refuses a second review even when a second purchase is unspent', async () => {
    scenario.orderItems = {
      data: [
        { id: 'oi-1', order_id: 'o-1' },
        { id: 'oi-2', order_id: 'o-2' },
      ],
      error: null,
    }
    scenario.myReviews = { data: [{ id: 'r-1', title: null }], error: null }
    expect(await getMyReviewableItem(PRODUCT)).toBeNull()
  })

  it('asks by product and not by order item', async () => {
    await getMyReviewableItem(PRODUCT)
    // If this ever goes back to reading order_item_id, the test above stops
    // measuring anything: an id-list read on two purchases returns the free one.
    expect(selects.some((c) => c.includes('order_item_id'))).toBe(false)
  })

  /**
   * A rejected review still spends the slot, and the way that is implemented is
   * an ABSENCE: the read applies no `status` filter, so pending, approved and
   * rejected rows all block. Asserting the absence is the only way to catch
   * somebody "fixing" it by adding `.eq('status', 'approved')`, which would let
   * a rejected spammer resubmit forever. The retry path is a soft delete --
   * see pending/189.
   */
  it('closes the form on a REJECTED review too, since the slot is still spent', async () => {
    scenario.myReviews = { data: [{ id: 'r-1', title: null }], error: null }
    expect(await getMyReviewableItem(PRODUCT)).toBeNull()
    const onReviews = filters.filter(([column]) => column === 'status')
    // The only `status` filter in this call belongs to the order_items read
    // (paid or later), and that one goes through `.in`, not `.eq`.
    expect(onReviews).toEqual([])
  })

  it('offers the form with no title field when the column does not exist', async () => {
    // 42703 says the deployment is behind 189. It says nothing about whether
    // this customer may review, so the read is repeated without the column.
    scenario.myReviews = { data: null, error: { code: '42703' } }
    expect(await getMyReviewableItem(PRODUCT)).toEqual({
      orderItemId: 'oi-1',
      titleSupported: false,
    })
  })

  it('still refuses on the no-title path when a review already exists', async () => {
    scenario.myReviews = { data: null, error: { code: '42703' } }
    scenario.myReviewsNoTitle = { data: [{ id: 'r-1' }], error: null }
    expect(await getMyReviewableItem(PRODUCT)).toBeNull()
  })

  it('answers null on any other read failure rather than guessing', async () => {
    scenario.myReviews = { data: null, error: { code: '57014' } }
    expect(await getMyReviewableItem(PRODUCT)).toBeNull()
  })
})

describe('submitReview', () => {
  it('inserts when the customer has not reviewed this product', async () => {
    expect(await submitReview(valid())).toEqual({ ok: true })
    expect(inserts).toHaveLength(1)
  })

  it('refuses a second review for the same product before touching the table', async () => {
    scenario.myReviews = { data: [{ id: 'r-1' }], error: null }
    scenario.myReviewsNoTitle = { data: [{ id: 'r-1' }], error: null }
    const result = await submitReview(valid())
    expect(result.ok).toBe(false)
    expect(result.error).toContain('המוצר הזה')
    expect(inserts).toHaveLength(0)
  })

  it('maps 23505 from either constraint to the same sentence', async () => {
    // The pre-check above is a race, not a lock. Whichever unique index fires
    // means the same thing to the customer.
    scenario.insertError = { code: '23505' }
    const result = await submitReview(valid())
    expect(result).toEqual({ ok: false, error: 'כבר כתבת ביקורת על המוצר הזה.' })
  })

  it('stores a title when one was given', async () => {
    await submitReview(
      form({ productId: PRODUCT, orderItemId: ORDER_ITEM, rating: '4', title: 'שווה כל שקל' }),
    )
    expect(inserts[0]).toMatchObject({ title: 'שווה כל שקל' })
  })

  it('does not store an empty title as a zero-length string', async () => {
    await submitReview(
      form({ productId: PRODUCT, orderItemId: ORDER_ITEM, rating: '4', title: '' }),
    )
    expect(Object.hasOwn(inserts[0] ?? {}, 'title')).toBe(false)
  })

  /**
   * The whole reason the retry exists: 42703 fails the STATEMENT, not the
   * field. Without it a customer who typed a headline against a database
   * behind 189 loses the review, not just the headline.
   */
  it('saves the review without the headline when the column does not exist', async () => {
    scenario.insertErrorWithTitle = { code: '42703' }
    const result = await submitReview(
      form({ productId: PRODUCT, orderItemId: ORDER_ITEM, rating: '5', title: 'כותרת' }),
    )
    expect(result).toEqual({ ok: true })
    expect(inserts).toHaveLength(2)
    expect(Object.hasOwn(inserts[1] ?? {}, 'title')).toBe(false)
  })

  it('does not retry when there was no title to drop', async () => {
    scenario.insertError = { code: '42703' }
    const result = await submitReview(valid())
    expect(result.ok).toBe(false)
    expect(inserts).toHaveLength(1)
  })

  it('rejects a title over the limit instead of truncating it', async () => {
    const result = await submitReview(
      form({
        productId: PRODUCT,
        orderItemId: ORDER_ITEM,
        rating: '5',
        title: 'א'.repeat(200),
      }),
    )
    expect(result.ok).toBe(false)
    expect(inserts).toHaveLength(0)
  })
})
