import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Integration test for the Supabase Database Webhook receiver on
 * `public.products`. This is the only webhook route in the repo that had no
 * test at all: the Cardcom, Twilio and WhatsApp receivers each pin their auth
 * and side effects, and this one silently did not.
 *
 * The route is exercised end to end through the real request-log wrapper, the
 * real payload contract (`dbChangePayloadSchema` + `jobForChange`) and the real
 * QStash transport. Only the two edges that leave the process are replaced:
 *
 *  - the indexer's job runner (Meilisearch + Supabase admin) is a recorder, so
 *    the "no QStash configured" path can prove the job ran INLINE with the
 *    exact op and product id the payload implied;
 *  - `fetch` is stubbed when QSTASH_TOKEN is set, so the "QStash configured"
 *    path can prove the publish call carries the retry, failure-callback and
 *    dedup headers the pipeline contract promises.
 *
 * Every payload is shaped the way Supabase's pg_net webhook actually sends it:
 * `{ type, table, schema, record, old_record }`.
 */

const SECRET = 'search-webhook-secret-for-tests'
const PRODUCT_ID = '0f2b6a9e-7c1d-4e5a-9b3c-2d8e1f4a6c7b'

const ran: Array<{ op: string; productId: string; reason: string }> = []

vi.mock('@/lib/search/indexer', () => ({
  runSearchIndexJob: async (job: { op: string; productId: string; reason: string }) => {
    ran.push({ op: job.op, productId: job.productId, reason: job.reason })
    return `recorded ${job.op} ${job.productId}`
  },
}))

const { POST } = await import('./route')

type Change = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table?: string
  schema?: string
  record?: Record<string, unknown> | null
  old_record?: Record<string, unknown> | null
}

function activeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PRODUCT_ID,
    slug: 'demo-product',
    name_he: 'מוצר לדוגמה',
    status: 'active',
    deleted_at: null,
    kenyon_price: 12900,
    ...overrides,
  }
}

function change(partial: Change): string {
  return JSON.stringify({ table: 'products', schema: 'public', ...partial })
}

function hmac(rawBody: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

function post(rawBody: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/webhooks/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  })
}

/** The way a Supabase dashboard webhook authenticates: a static header. */
function postShared(rawBody: string): NextRequest {
  return post(rawBody, { 'x-webhook-secret': SECRET })
}

/** The way a signing sender authenticates: HMAC of the raw body. */
function postSigned(rawBody: string, secret = SECRET): NextRequest {
  return post(rawBody, { 'x-search-signature': hmac(rawBody, secret) })
}

beforeEach(() => {
  ran.length = 0
  vi.stubEnv('SEARCH_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('QSTASH_TOKEN', '')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/webhooks/products: sender authentication', () => {
  it('is closed when no secret is configured, even to a caller presenting one', async () => {
    vi.stubEnv('SEARCH_WEBHOOK_SECRET', '')
    const body = change({ type: 'INSERT', record: activeRow() })

    const res = await POST(postShared(body))

    expect(res.status).toBe(401)
    expect(ran).toEqual([])
  })

  it('rejects a missing credential', async () => {
    const res = await POST(post(change({ type: 'INSERT', record: activeRow() }), {}))
    expect(res.status).toBe(401)
    expect(ran).toEqual([])
  })

  it('rejects a wrong shared secret', async () => {
    const body = change({ type: 'INSERT', record: activeRow() })
    const res = await POST(post(body, { 'x-webhook-secret': 'not-the-secret' }))
    expect(res.status).toBe(401)
    expect(ran).toEqual([])
  })

  it('rejects a signature made with the wrong key', async () => {
    const body = change({ type: 'INSERT', record: activeRow() })
    const res = await POST(postSigned(body, 'another-secret'))
    expect(res.status).toBe(401)
    expect(ran).toEqual([])
  })

  it('rejects a valid signature over a different body (tampered payload)', async () => {
    const signedFor = change({ type: 'INSERT', record: activeRow() })
    const delivered = change({ type: 'DELETE', old_record: activeRow() })
    const res = await POST(post(delivered, { 'x-search-signature': hmac(signedFor) }))
    expect(res.status).toBe(401)
    expect(ran).toEqual([])
  })

  it('a signature header wins over a shared-secret header when both are present', async () => {
    // A sender that CAN sign must not be let in on the weaker credential when
    // its signature is bad; the route checks the signature and stops there.
    const body = change({ type: 'INSERT', record: activeRow() })
    const res = await POST(
      post(body, { 'x-search-signature': 'deadbeef', 'x-webhook-secret': SECRET }),
    )
    expect(res.status).toBe(401)
  })

  it('accepts the shared-secret header (Supabase dashboard webhook shape)', async () => {
    const res = await POST(postShared(change({ type: 'INSERT', record: activeRow() })))
    expect(res.status).toBe(200)
  })

  it('accepts a correct HMAC-SHA256 signature over the raw body', async () => {
    const res = await POST(postSigned(change({ type: 'INSERT', record: activeRow() })))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/webhooks/products: payload contract', () => {
  it('answers 400 on a body that is not JSON', async () => {
    const res = await POST(postShared('{not json'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'invalid json' })
    expect(ran).toEqual([])
  })

  it('answers 400 on JSON that is not a database change', async () => {
    const res = await POST(postShared(JSON.stringify({ hello: 'world' })))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'unrecognized payload' })
    expect(ran).toEqual([])
  })

  it('answers 400 on an unknown change type', async () => {
    const res = await POST(
      postShared(JSON.stringify({ type: 'TRUNCATE', table: 'products', schema: 'public' })),
    )
    expect(res.status).toBe(400)
  })

  it('acknowledges a change on another table without queueing anything', async () => {
    const res = await POST(
      postShared(change({ type: 'UPDATE', table: 'orders', record: { id: PRODUCT_ID } })),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, queued: false })
    expect(ran).toEqual([])
  })

  it('acknowledges a products row with no usable id without queueing anything', async () => {
    const res = await POST(postShared(change({ type: 'INSERT', record: { id: 'not-a-uuid' } })))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, queued: false })
    expect(ran).toEqual([])
  })

  it('echoes the request id header the way every other route does', async () => {
    const res = await POST(postShared(change({ type: 'INSERT', record: activeRow() })))
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })
})

describe('POST /api/webhooks/products: inline transport (no QStash configured)', () => {
  it('INSERT of an active product runs an upsert for that id', async () => {
    const res = await POST(postShared(change({ type: 'INSERT', record: activeRow() })))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, queued: true, transport: 'inline' })
    expect(ran).toEqual([{ op: 'upsert', productId: PRODUCT_ID, reason: 'insert:active' }])
  })

  it('UPDATE that keeps the product active runs an upsert', async () => {
    await POST(
      postShared(
        change({
          type: 'UPDATE',
          record: activeRow({ kenyon_price: 9900 }),
          old_record: activeRow(),
        }),
      ),
    )
    expect(ran).toEqual([{ op: 'upsert', productId: PRODUCT_ID, reason: 'update:active' }])
  })

  it('UPDATE that soft-deletes the product runs a delete', async () => {
    await POST(
      postShared(
        change({
          type: 'UPDATE',
          record: activeRow({ deleted_at: '2026-09-17T00:00:00.000Z' }),
          old_record: activeRow(),
        }),
      ),
    )
    expect(ran).toEqual([{ op: 'delete', productId: PRODUCT_ID, reason: 'update:active' }])
  })

  it('UPDATE that takes the product out of the public predicate runs a delete', async () => {
    await POST(
      postShared(
        change({ type: 'UPDATE', record: activeRow({ status: 'draft' }), old_record: activeRow() }),
      ),
    )
    expect(ran).toEqual([{ op: 'delete', productId: PRODUCT_ID, reason: 'update:draft' }])
  })

  it('DELETE reads the id from old_record and runs a delete', async () => {
    await POST(postShared(change({ type: 'DELETE', record: null, old_record: activeRow() })))
    expect(ran).toEqual([{ op: 'delete', productId: PRODUCT_ID, reason: 'delete:active' }])
  })

  it('answers 500 when the inline run throws, so Supabase retries the delivery', async () => {
    vi.doMock('@/lib/search/indexer', () => ({
      runSearchIndexJob: async () => {
        throw new Error('meilisearch is down')
      },
    }))
    vi.resetModules()
    const { POST: freshPOST } = await import('./route')

    const res = await freshPOST(postShared(change({ type: 'INSERT', record: activeRow() })))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'enqueue failed' })

    vi.doUnmock('@/lib/search/indexer')
    vi.resetModules()
  })
})

describe('POST /api/webhooks/products: QStash transport', () => {
  const publishes: Array<{ url: string; headers: Record<string, string>; body: unknown }> = []

  beforeEach(() => {
    publishes.length = 0
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token-for-tests')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        publishes.push({
          url: String(url),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body: JSON.parse(String(init?.body)),
        })
        return new Response(JSON.stringify({ messageId: 'msg_123' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
  })

  it('publishes the job to QStash with retries, failure callback and dedup id', async () => {
    const res = await POST(postShared(change({ type: 'INSERT', record: activeRow() })))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, queued: true, transport: 'qstash' })
    // Nothing ran in-process: the worker route is what QStash will call.
    expect(ran).toEqual([])

    expect(publishes).toHaveLength(1)
    const [publish] = publishes as [(typeof publishes)[number]]
    expect(publish.url).toBe(
      'https://qstash.upstash.io/v2/publish/http://localhost:3000/api/search/index-job',
    )
    expect(publish.headers.authorization).toBe('Bearer qstash-token-for-tests')
    expect(publish.headers['upstash-retries']).toBe('5')
    expect(publish.headers['upstash-failure-callback']).toBe(
      'http://localhost:3000/api/search/index-dlq',
    )
    expect(publish.headers['upstash-deduplication-id']).toMatch(
      new RegExp(`^upsert:${PRODUCT_ID}:\\d{4}-\\d{2}-\\d{2}T`),
    )
    expect(publish.body).toMatchObject({
      op: 'upsert',
      productId: PRODUCT_ID,
      reason: 'insert:active',
    })
  })

  it('answers 500 when QStash refuses the publish, so the delivery is retried', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 })),
    )

    const res = await POST(postShared(change({ type: 'DELETE', old_record: activeRow() })))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'enqueue failed' })
  })
})
