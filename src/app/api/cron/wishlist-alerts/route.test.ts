import { priceDropDedupeKey } from '@/lib/wishlist/alerts'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The price-drop and back-in-stock producer (STEP 37 gave it a test; the
 * route itself is 200/233's). Pinned: closed without the secret; a wishlisted
 * product whose sticker fell below its previous observed day queues exactly
 * one `price_drop` row per owner, keyed so a re-run cannot double-mail; an
 * owner who turned price drops off is skipped; a suppressed address never
 * reaches the outbox; a duplicate key counts as deduped, not failed; and a
 * missing `wishlist_stock_state` degrades to "no restock pass" instead of a
 * half run. The snapshot writer is its own module with its own tests.
 */

const TODAY = '2026-10-08'

const { createAdminClient, snapshotPrices } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  snapshotPrices: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/pricing/price-snapshot', () => ({
  jerusalemDayKey: () => TODAY,
  snapshotPrices,
}))

import { GET } from './route'

type Result = { data?: unknown; error?: { code?: string; message: string } | null }

/** Per-table answers. Any chain on a table resolves to its entry. */
let results: Record<string, Result>
let inserts: { table: string; row: Record<string, unknown> }[]
let insertResult: (row: Record<string, unknown>) => Result

/**
 * A real Promise (so `await` works at any chain length without defining a
 * `then` of our own) carrying the query-builder methods, each returning the
 * same promise. `insert` is the one terminal that records what it was given.
 */
function builder(table: string) {
  const settled: Promise<Result> = Promise.resolve(results[table] ?? { data: null, error: null })
  const chain = () => b
  const b = Object.assign(settled, {
    select: vi.fn(chain),
    is: vi.fn(chain),
    limit: vi.fn(chain),
    in: vi.fn(chain),
    gte: vi.fn(chain),
    eq: vi.fn(chain),
    not: vi.fn(chain),
    order: vi.fn(chain),
    update: vi.fn(chain),
    upsert: vi.fn(chain),
    insert: vi.fn((row: Record<string, unknown>) => {
      inserts.push({ table, row })
      return Promise.resolve(insertResult(row))
    }),
  })
  return b
}

const from = vi.fn((table: string) => builder(table))

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/wishlist-alerts', {
    headers: auth ? { authorization: auth } : {},
  })
}

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function baseline(): Record<string, Result> {
  return {
    products: {
      data: [
        {
          id: P1,
          name_he: 'ספה',
          slug: 'sofa',
          status: 'active',
          stock_quantity: 3,
          kenyon_price_agorot: 8000,
          full_price_agorot: 12000,
        },
        {
          id: P2,
          name_he: 'שולחן',
          slug: 'table',
          status: 'active',
          stock_quantity: 1,
          kenyon_price_agorot: 5000,
          full_price_agorot: null,
        },
      ],
      error: null,
    },
    wishlists: {
      data: [
        { user_id: U1, product_id: P1 },
        { user_id: U2, product_id: P1 },
        { user_id: U1, product_id: P2 },
      ],
      error: null,
    },
    price_history: {
      data: [
        { product_id: P1, observed_on: '2026-10-07', price_agorot: 10000 },
        { product_id: P2, observed_on: '2026-10-07', price_agorot: 5000 },
      ],
      error: null,
    },
    // 233 not applied: a missing table skips the restock pass, not the run.
    wishlist_stock_state: { data: null, error: { code: 'PGRST205', message: 'missing' } },
    wishlist_alert_prefs: {
      data: [{ user_id: U2, price_drop: false, back_in_stock: true }],
      error: null,
    },
    profiles: {
      data: [
        { id: U1, email: 'U1@Example.com' },
        { id: U2, email: 'u2@example.com' },
      ],
      error: null,
    },
    stock_waitlist: { data: [], error: null },
    email_suppressions: { data: [], error: null },
  }
}

describe('wishlist-alerts cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    results = baseline()
    inserts = []
    insertResult = () => ({ error: null })
    createAdminClient.mockReturnValue({ from })
    snapshotPrices.mockResolvedValue({ written: 2, alreadyObserved: 0, unpriced: 0 })
    vi.stubEnv('CRON_SECRET', 's3cret')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential before building a client', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(createAdminClient).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(snapshotPrices).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
    })
  })

  it('queues one price_drop per owner who wants it, keyed on the new price', async () => {
    const response = await GET(request('Bearer s3cret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      day: TODAY,
      snapshotted: 2,
      priceDrops: 1,
      restocked: 0,
      stateAvailable: false,
      waitlisted: 0,
      queued: 1,
      deduped: 0,
      failed: 0,
    })
    // The snapshot runs first, on every product, under this job's name.
    expect(snapshotPrices).toHaveBeenCalledTimes(1)
    expect(snapshotPrices.mock.calls[0]?.[2]).toBe(TODAY)
    expect(snapshotPrices.mock.calls[0]?.[3]).toBe('wishlist_alerts')

    // U2 turned price drops off; P2 did not move. Exactly U1 x P1 is owed.
    expect(inserts).toHaveLength(1)
    expect(inserts[0]?.table).toBe('notification_outbox')
    expect(inserts[0]?.row).toMatchObject({
      kind: 'price_drop',
      recipient_email: 'u1@example.com',
      user_id: U1,
      dedupe_key: priceDropDedupeKey(U1, P1, 8000),
      payload: { product_id: P1, slug: 'sofa', old_agorot: 10000, new_agorot: 8000 },
    })
  })

  it('counts a duplicate dedupe key as deduped, not failed', async () => {
    insertResult = () => ({ error: { code: '23505', message: 'duplicate key value' } })
    const body = await (await GET(request('Bearer s3cret'))).json()
    expect(body).toMatchObject({ ok: true, queued: 0, deduped: 1, failed: 0 })
  })

  it('drops a suppressed address before the outbox, like the enqueue RPC', async () => {
    results.email_suppressions = { data: [{ email: 'u1@example.com' }], error: null }
    const body = await (await GET(request('Bearer s3cret'))).json()
    expect(body).toMatchObject({ ok: true, priceDrops: 1, queued: 0 })
    expect(inserts).toHaveLength(0)
  })

  it('finds no drop when the previous day was cheaper or equal', async () => {
    results.price_history = {
      data: [{ product_id: P1, observed_on: '2026-10-07', price_agorot: 8000 }],
      error: null,
    }
    const body = await (await GET(request('Bearer s3cret'))).json()
    expect(body).toMatchObject({ ok: true, priceDrops: 0, queued: 0 })
  })

  it('is red when the product read fails, before any snapshot or enqueue', async () => {
    results.products = { data: null, error: { message: 'timeout' } }
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(snapshotPrices).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
  })
})
