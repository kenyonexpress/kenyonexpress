import { createHmac } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const purgeImageCache = vi.fn()
vi.mock('@/lib/images/purge', () => ({
  purgeImageCache: (...args: unknown[]) => purgeImageCache(...args),
}))

const { POST } = await import('./route')

const SECRET = 'purge-secret-of-at-least-twenty-chars'
const url = 'https://kenyonexpress.co.il/api/webhooks/images/purge'

function post(body: unknown, headers: Record<string, string> = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request(url, { method: 'POST', body: raw, headers }) as NextRequest
}

const unconfigured = (backend: string) => ({ backend, ok: true, status: 'unconfigured' })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.IMAGE_PURGE_WEBHOOK_SECRET = SECRET
  purgeImageCache.mockResolvedValue({
    tags: ['image:products%2Fa.webp'],
    srcImages: [],
    urls: [],
    results: [
      { backend: 'vercel-tags', ok: true, status: 200 },
      { backend: 'vercel-src-images', ok: true, status: 200 },
      unconfigured('cloudflare'),
    ],
    purged: true,
  })
})

afterEach(() => {
  process.env.IMAGE_PURGE_WEBHOOK_SECRET = undefined
})

describe('POST /api/webhooks/images/purge', () => {
  it('is closed when the secret is unset, even to a correct-looking header', async () => {
    process.env.IMAGE_PURGE_WEBHOOK_SECRET = ''
    const res = await POST(post({ keys: ['products/a.webp'] }, { 'x-webhook-secret': SECRET }))
    expect(res.status).toBe(401)
    expect(purgeImageCache).not.toHaveBeenCalled()
  })

  it('refuses a wrong static secret and a wrong signature', async () => {
    expect(
      (await POST(post({ keys: ['products/a.webp'] }, { 'x-webhook-secret': 'x' }))).status,
    ).toBe(401)
    expect(
      (await POST(post({ keys: ['products/a.webp'] }, { 'x-image-purge-signature': 'deadbeef' })))
        .status,
    ).toBe(401)
    expect((await POST(post({ keys: ['products/a.webp'] }))).status).toBe(401)
    expect(purgeImageCache).not.toHaveBeenCalled()
  })

  it('accepts the HMAC of the raw body', async () => {
    const raw = JSON.stringify({ keys: ['products/a.webp'] })
    const signature = createHmac('sha256', SECRET).update(raw).digest('hex')
    const res = await POST(post(raw, { 'x-image-purge-signature': signature }))
    expect(res.status).toBe(200)
    expect(purgeImageCache).toHaveBeenCalledWith({ keys: ['products/a.webp'], all: false })
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      purged: true,
      keys: ['products/a.webp'],
    })
  })

  it('accepts the static secret, maps paths to keys, and reports the rejects', async () => {
    const res = await POST(
      post(
        { paths: ['/images/products/b7.avif', '/images/products/logo.svg'] },
        { 'x-webhook-secret': SECRET },
      ),
    )
    expect(res.status).toBe(200)
    expect(purgeImageCache).toHaveBeenCalledWith({ keys: ['products/b7.avif'], all: false })
    const json = await res.json()
    expect(json.rejected).toEqual(['/images/products/logo.svg'])
    expect(json.tags).toEqual(['image:products%2Fa.webp'])
  })

  it('answers 400 to bad JSON and to a payload it does not recognise', async () => {
    expect((await POST(post('{', { 'x-webhook-secret': SECRET }))).status).toBe(400)
    expect((await POST(post({ hello: 1 }, { 'x-webhook-secret': SECRET }))).status).toBe(400)
    expect(purgeImageCache).not.toHaveBeenCalled()
  })

  it('acknowledges a Supabase change on another table without purging', async () => {
    const res = await POST(
      post(
        { type: 'UPDATE', table: 'products', record: { id: 1 } },
        { 'x-webhook-secret': SECRET },
      ),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, purged: false, keys: [] })
    expect(purgeImageCache).not.toHaveBeenCalled()
  })

  it('is a 202 with a reason when no purge backend is configured', async () => {
    purgeImageCache.mockResolvedValue({
      tags: [],
      srcImages: [],
      urls: [],
      results: [
        unconfigured('vercel-tags'),
        unconfigured('vercel-src-images'),
        unconfigured('cloudflare'),
      ],
      purged: false,
    })
    const res = await POST(post({ all: true }, { 'x-webhook-secret': SECRET }))
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      purged: false,
      all: true,
      reason: 'no purge backend configured',
    })
    expect(purgeImageCache).toHaveBeenCalledWith({ keys: [], all: true })
  })

  it('is a 502 when a configured backend refused, so the sender retries', async () => {
    purgeImageCache.mockResolvedValue({
      tags: [],
      srcImages: [],
      urls: [],
      results: [
        { backend: 'vercel-tags', ok: false, status: 403, detail: 'forbidden' },
        { backend: 'vercel-src-images', ok: true, status: 200 },
        unconfigured('cloudflare'),
      ],
      purged: true,
    })
    const res = await POST(post({ keys: ['products/a.webp'] }, { 'x-webhook-secret': SECRET }))
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ ok: false, purged: true })
  })
})
