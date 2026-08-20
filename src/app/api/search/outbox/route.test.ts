import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The drain endpoint reaches the database with the service key and writes the
 * search index, so the only thing worth pinning harder than what it does is who
 * may ask it to.
 */

const drainSearchOutbox = vi.fn()

vi.mock('@/lib/search/outbox', () => ({
  OUTBOX_BATCH_SIZE: 25,
  drainSearchOutbox: (...args: unknown[]) => drainSearchOutbox(...args),
}))

const { GET, POST } = await import('./route')

const SECRET = 'cron-secret-value'

function request(url = 'http://localhost/api/search/outbox', auth?: string) {
  return new NextRequest(url, {
    headers: auth ? { authorization: auth } : {},
  })
}

beforeEach(() => {
  drainSearchOutbox.mockReset().mockResolvedValue({
    claimed: 2,
    indexed: 2,
    failed: 0,
    errors: [],
  })
  vi.stubEnv('CRON_SECRET', SECRET)
  vi.stubEnv('MEILISEARCH_HOST', 'http://meili.local')
  vi.stubEnv('MEILISEARCH_API_KEY', 'meili-key')
})

describe('auth', () => {
  it('401s without a bearer token, and drains nothing', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(drainSearchOutbox).not.toHaveBeenCalled()
  })

  it('401s on a wrong token', async () => {
    expect((await GET(request(undefined, 'Bearer wrong'))).status).toBe(401)
    expect(drainSearchOutbox).not.toHaveBeenCalled()
  })

  it('CLOSES rather than opens when CRON_SECRET is unset', async () => {
    // The dangerous shape of this check is `if (secret && !matches)`, which
    // lets every caller through on a deployment that forgot the variable.
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request(undefined, 'Bearer anything'))).status).toBe(401)
    expect((await GET(request())).status).toBe(401)
    expect(drainSearchOutbox).not.toHaveBeenCalled()
  })

  it('accepts the right token on GET and on POST alike', async () => {
    expect((await GET(request(undefined, `Bearer ${SECRET}`))).status).toBe(200)
    expect((await POST(request(undefined, `Bearer ${SECRET}`))).status).toBe(200)
    expect(drainSearchOutbox).toHaveBeenCalledTimes(2)
  })
})

describe('draining', () => {
  it('reports the counts', async () => {
    const res = await GET(request(undefined, `Bearer ${SECRET}`))
    expect(await res.json()).toMatchObject({ ok: true, claimed: 2, indexed: 2, failed: 0 })
  })

  it('skips without touching the queue when Meilisearch is not configured', async () => {
    // The rows stay pending on purpose: they are changes the index has not
    // received, and there is no index.
    vi.stubEnv('MEILISEARCH_HOST', '')
    const res = await GET(request(undefined, `Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ skipped: 'meilisearch not configured' })
    expect(drainSearchOutbox).not.toHaveBeenCalled()
  })

  it('caps the requested limit and ignores a nonsense one', async () => {
    const url = 'http://localhost/api/search/outbox?limit=5000'
    await GET(request(url, `Bearer ${SECRET}`))
    expect(drainSearchOutbox).toHaveBeenCalledWith({ limit: 200 })

    await GET(request('http://localhost/api/search/outbox?limit=abc', `Bearer ${SECRET}`))
    expect(drainSearchOutbox).toHaveBeenLastCalledWith({ limit: 25 })

    await GET(request('http://localhost/api/search/outbox?limit=-4', `Bearer ${SECRET}`))
    expect(drainSearchOutbox).toHaveBeenLastCalledWith({ limit: 25 })
  })

  it('200s on a partial failure, because the rest of the batch was indexed', async () => {
    drainSearchOutbox.mockResolvedValue({
      claimed: 25,
      indexed: 22,
      failed: 3,
      errors: ['x: boom'],
    })
    const res = await GET(request(undefined, `Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, indexed: 22, failed: 3 })
  })

  it('500s when the claim itself fails, because nothing is in flight', async () => {
    drainSearchOutbox.mockRejectedValue(new Error('permission denied'))
    const res = await GET(request(undefined, `Bearer ${SECRET}`))
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, error: 'permission denied' })
  })
})
