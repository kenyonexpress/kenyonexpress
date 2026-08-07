import { createHmac } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Route-level tests for the pipeline's two entry points: the products webhook
 * and the queue worker. Transport (QStash) and execution (indexer) are mocked;
 * what is pinned here is auth and the HTTP contract — who gets 401, what gets
 * acknowledged, and which failures are retryable (non-2xx).
 */

const SECRET = 'search-webhook-secret'
const PRODUCT_ID = '3e9a4f6c-1b2d-4c5e-8f7a-9b0c1d2e3f4a'

const enqueueMock = vi.fn()
const runJobMock = vi.fn()
const verifySignatureMock = vi.fn()

vi.mock('@/lib/search/qstash', () => ({
  enqueueSearchIndexJob: (...args: unknown[]) => enqueueMock(...args),
  verifyQstashSignature: (...args: unknown[]) => verifySignatureMock(...args),
}))
vi.mock('@/lib/search/indexer', () => ({
  runSearchIndexJob: (...args: unknown[]) => runJobMock(...args),
}))

const { POST: webhookPost } = await import('@/app/api/webhooks/products/route')
const { POST: workerPost } = await import('@/app/api/search/index-job/route')

function post(url: string, body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request(url, { method: 'POST', body, headers }) as unknown as NextRequest
}

const change = JSON.stringify({
  type: 'UPDATE',
  table: 'products',
  schema: 'public',
  record: { id: PRODUCT_ID, status: 'active', deleted_at: null },
})

beforeEach(() => {
  vi.stubEnv('SEARCH_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il')
  enqueueMock.mockReset().mockResolvedValue({ transport: 'qstash', messageId: 'm1' })
  runJobMock.mockReset().mockResolvedValue('upserted x')
  verifySignatureMock.mockReset().mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/webhooks/products', () => {
  const url = 'https://kenyonexpress.co.il/api/webhooks/products'

  it('accepts a body signed with HMAC-SHA256', async () => {
    const signature = createHmac('sha256', SECRET).update(change).digest('hex')
    const res = await webhookPost(post(url, change, { 'x-search-signature': signature }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, queued: true, transport: 'qstash' })
    expect(enqueueMock).toHaveBeenCalledOnce()
  })

  it('accepts the static shared-secret header', async () => {
    const res = await webhookPost(post(url, change, { 'x-webhook-secret': SECRET }))
    expect(res.status).toBe(200)
    expect(enqueueMock).toHaveBeenCalledOnce()
  })

  it('rejects a wrong signature, a wrong secret, and no auth at all', async () => {
    const attempts: Record<string, string>[] = [
      { 'x-search-signature': 'deadbeef' },
      { 'x-webhook-secret': 'wrong' },
      {},
    ]
    for (const headers of attempts) {
      const res = await webhookPost(post(url, change, headers))
      expect(res.status).toBe(401)
    }
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('rejects everything when the secret env is missing (fail closed)', async () => {
    vi.stubEnv('SEARCH_WEBHOOK_SECRET', '')
    const res = await webhookPost(post(url, change, { 'x-webhook-secret': '' }))
    expect(res.status).toBe(401)
  })

  it('acknowledges non-indexable changes without queueing', async () => {
    const body = JSON.stringify({ type: 'UPDATE', table: 'orders', schema: 'public', record: {} })
    const res = await webhookPost(post(url, body, { 'x-webhook-secret': SECRET }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, queued: false })
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('answers 400 on malformed payloads', async () => {
    expect((await webhookPost(post(url, 'not json', { 'x-webhook-secret': SECRET }))).status).toBe(
      400,
    )
    expect(
      (await webhookPost(post(url, '{"type":"NOPE"}', { 'x-webhook-secret': SECRET }))).status,
    ).toBe(400)
  })

  it('answers 500 when enqueue fails, so the sender retries', async () => {
    enqueueMock.mockRejectedValue(new Error('qstash down'))
    const res = await webhookPost(post(url, change, { 'x-webhook-secret': SECRET }))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/search/index-job', () => {
  const url = 'https://kenyonexpress.co.il/api/search/index-job'
  const job = JSON.stringify({
    op: 'upsert',
    productId: PRODUCT_ID,
    reason: 'update:active',
    enqueuedAt: '2026-07-27T10:00:00.000Z',
  })

  it('accepts a valid QStash signature and runs the job', async () => {
    verifySignatureMock.mockReturnValue(true)
    const res = await workerPost(post(url, job, { 'upstash-signature': 'jws' }))
    expect(res.status).toBe(200)
    expect(runJobMock).toHaveBeenCalledOnce()
    expect(verifySignatureMock).toHaveBeenCalledWith('jws', job, url)
  })

  it('accepts Bearer CRON_SECRET for manual replays', async () => {
    const res = await workerPost(post(url, job, { authorization: 'Bearer cron-secret' }))
    expect(res.status).toBe(200)
    expect(runJobMock).toHaveBeenCalledOnce()
  })

  it('rejects unsigned and wrongly-signed requests', async () => {
    expect((await workerPost(post(url, job))).status).toBe(401)
    expect((await workerPost(post(url, job, { authorization: 'Bearer wrong' }))).status).toBe(401)
    expect(runJobMock).not.toHaveBeenCalled()
  })

  it('acks malformed jobs as dead instead of retrying forever', async () => {
    verifySignatureMock.mockReturnValue(true)
    const bad = await workerPost(post(url, '{"op":"noop"}', { 'upstash-signature': 'jws' }))
    expect(bad.status).toBe(200)
    expect(await bad.json()).toMatchObject({ ok: true, dropped: 'unrecognized job' })
    expect(runJobMock).not.toHaveBeenCalled()
  })

  it('answers 500 when the job fails, so QStash retries', async () => {
    verifySignatureMock.mockReturnValue(true)
    runJobMock.mockRejectedValue(new Error('meili down'))
    const res = await workerPost(post(url, job, { 'upstash-signature': 'jws' }))
    expect(res.status).toBe(500)
  })
})
