import { waitlistDedupeKey } from '@/lib/wishlist/alerts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type WaitlistProduct,
  type WaitlistRow,
  crossedIntoStock,
  notifyProductWaitlist,
  waitlistOutboxRow,
} from './waitlist-notify'

/**
 * The per-product restock batch (STEP 58). Pinned: a product still sold out
 * queues nothing and stamps nothing; a restocked product queues one
 * `back_in_stock` row per waiting address, keyed on the waitlist row id so the
 * daily cron finding the same row cannot mail twice; a duplicate key counts
 * as deduped and still stamps; a suppressed address is stamped without a mail;
 * a variant request is honoured only when that variant is sellable; a failed
 * insert leaves its row unstamped for the cron.
 */

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const P = '11111111-1111-4111-8111-111111111111'
const V_OK = '22222222-2222-4222-8222-222222222222'
const V_GONE = '33333333-3333-4333-8333-333333333333'

type Result = { data?: unknown; error?: { code?: string; message: string } | null }

let results: Record<string, Result>
let inserts: Record<string, unknown>[]
let updates: { table: string; payload: Record<string, unknown>; ids: unknown }[]
let insertResult: (row: Record<string, unknown>) => Result

function builder(table: string) {
  const settled: Promise<Result> = Promise.resolve(results[table] ?? { data: null, error: null })
  let inIds: unknown
  let pendingUpdate: Record<string, unknown> | null = null
  const chain = () => b
  const b = Object.assign(settled, {
    select: vi.fn(chain),
    is: vi.fn(chain),
    eq: vi.fn(chain),
    limit: vi.fn(chain),
    in: vi.fn((_col: string, ids: unknown) => {
      inIds = ids
      if (pendingUpdate) updates.push({ table, payload: pendingUpdate, ids })
      return b
    }),
    maybeSingle: vi.fn(() => settled),
    update: vi.fn((payload: Record<string, unknown>) => {
      pendingUpdate = payload
      return b
    }),
    insert: vi.fn((row: Record<string, unknown>) => {
      inserts.push(row)
      return Promise.resolve(insertResult(row))
    }),
    _inIds: () => inIds,
  })
  return b
}

const admin = { from: vi.fn((table: string) => builder(table)) } as never

const product: WaitlistProduct = {
  id: P,
  name_he: 'תיק גב',
  slug: 'backpack',
  status: 'active',
  stock_quantity: 5,
  kenyon_price_agorot: 15_000,
}

const row = (id: string, extra: Partial<WaitlistRow> = {}): WaitlistRow => ({
  id,
  product_id: P,
  variant_id: null,
  email: `w${id}@example.com`,
  user_id: null,
  ...extra,
})

beforeEach(() => {
  inserts = []
  updates = []
  insertResult = () => ({ data: null, error: null })
  results = {
    products: { data: product, error: null },
    stock_waitlist: { data: [row('a'), row('b')], error: null },
    email_suppressions: { data: [], error: null },
    product_variants: { data: [], error: null },
  }
})

describe('crossedIntoStock', () => {
  it('fires only on sold-out to sellable, for an active product', () => {
    expect(
      crossedIntoStock(
        { stock_quantity: 0, status: 'active' },
        { stock_quantity: 3, status: 'active' },
      ),
    ).toBe(true)
    expect(
      crossedIntoStock(
        { stock_quantity: 0, status: 'active' },
        { stock_quantity: null, status: 'active' },
      ),
    ).toBe(true)
    expect(
      crossedIntoStock(
        { stock_quantity: 0, status: 'paused' },
        { stock_quantity: 0, status: 'active' },
      ),
    ).toBe(false)
    expect(
      crossedIntoStock(
        { stock_quantity: 4, status: 'active' },
        { stock_quantity: 9, status: 'active' },
      ),
    ).toBe(false)
    expect(
      crossedIntoStock(
        { stock_quantity: 0, status: 'active' },
        { stock_quantity: 9, status: 'draft' },
      ),
    ).toBe(false)
    expect(crossedIntoStock(null, { stock_quantity: 9, status: 'active' })).toBe(false)
  })
})

describe('waitlistOutboxRow', () => {
  it('keys on the waitlist row, lowercases the address and carries no unsubscribe', () => {
    const out = waitlistOutboxRow(row('a', { email: 'Someone@Example.com' }), product)
    expect(out).toEqual({
      kind: 'back_in_stock',
      recipient_email: 'someone@example.com',
      user_id: null,
      dedupe_key: waitlistDedupeKey('a'),
      payload: {
        product_id: P,
        product_name: 'תיק גב',
        slug: 'backpack',
        price_agorot: 15_000,
        unsubscribe_url: null,
      },
    })
  })
})

describe('notifyProductWaitlist', () => {
  it('queues nothing while the product is still sold out', async () => {
    results.products = { data: { ...product, stock_quantity: 0 }, error: null }
    const result = await notifyProductWaitlist(admin, P)
    expect(result).toMatchObject({ ok: true, reason: 'not in stock', queued: 0, stamped: 0 })
    expect(inserts).toEqual([])
    expect(updates).toEqual([])
  })

  it('queues one row per waiting address and stamps them', async () => {
    const result = await notifyProductWaitlist(admin, P, new Date('2026-10-08T10:00:00Z'))
    expect(result).toMatchObject({ ok: true, waiting: 2, queued: 2, deduped: 0, stamped: 2 })
    expect(inserts.map((r) => r.dedupe_key)).toEqual([
      waitlistDedupeKey('a'),
      waitlistDedupeKey('b'),
    ])
    expect(inserts[0]).toMatchObject({
      kind: 'back_in_stock',
      recipient_email: 'wa@example.com',
      payload: { product_name: 'תיק גב', slug: 'backpack', price_agorot: 15_000 },
    })
    expect(updates).toEqual([
      {
        table: 'stock_waitlist',
        payload: { notified_at: '2026-10-08T10:00:00.000Z' },
        ids: ['a', 'b'],
      },
    ])
  })

  it('counts a duplicate key as deduped and still stamps it, so the cron cannot re-mail', async () => {
    insertResult = (r) =>
      r.dedupe_key === waitlistDedupeKey('a')
        ? { data: null, error: { code: '23505', message: 'duplicate key value' } }
        : { data: null, error: null }
    const result = await notifyProductWaitlist(admin, P)
    expect(result).toMatchObject({ ok: true, queued: 1, deduped: 1, failed: 0, stamped: 2 })
  })

  it('leaves a row whose insert failed unstamped, for the daily cron', async () => {
    insertResult = (r) =>
      r.dedupe_key === waitlistDedupeKey('b')
        ? { data: null, error: { code: '42501', message: 'permission denied' } }
        : { data: null, error: null }
    const result = await notifyProductWaitlist(admin, P)
    expect(result).toMatchObject({ ok: false, queued: 1, failed: 1, stamped: 1 })
    expect(updates[0]?.ids).toEqual(['a'])
  })

  it('stamps a suppressed address without mailing it', async () => {
    results.email_suppressions = { data: [{ email: 'wa@example.com' }], error: null }
    const result = await notifyProductWaitlist(admin, P)
    expect(result).toMatchObject({ queued: 1, stamped: 2 })
    expect(inserts.map((r) => r.recipient_email)).toEqual(['wb@example.com'])
  })

  it('honours a variant request only when that variant is sellable', async () => {
    results.stock_waitlist = {
      data: [row('a', { variant_id: V_OK }), row('b', { variant_id: V_GONE }), row('c')],
      error: null,
    }
    results.product_variants = {
      data: [
        { id: V_OK, stock_quantity: 2, is_active: true, deleted_at: null },
        { id: V_GONE, stock_quantity: 0, is_active: true, deleted_at: null },
      ],
      error: null,
    }
    const result = await notifyProductWaitlist(admin, P)
    expect(result).toMatchObject({ waiting: 2, queued: 2, stamped: 2 })
    expect(inserts.map((r) => r.dedupe_key)).toEqual([
      waitlistDedupeKey('a'),
      waitlistDedupeKey('c'),
    ])
    expect(updates[0]?.ids).toEqual(['a', 'c'])
  })

  it('degrades to a result, not a throw, when the table is missing', async () => {
    results.stock_waitlist = { data: null, error: { code: 'PGRST205', message: 'missing' } }
    const result = await notifyProductWaitlist(admin, P)
    expect(result).toMatchObject({ ok: false, queued: 0, stamped: 0 })
    expect(inserts).toEqual([])
  })
})
