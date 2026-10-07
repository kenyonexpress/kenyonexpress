import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The on-demand revalidation door (STEP 36). What is pinned: who gets 401,
 * what is refused as a target, and that an accepted call reaches Next's
 * `revalidateTag` with the SWR profile and `revalidatePath` with the path.
 * `next/cache` is mocked because both throw outside a Next work store.
 */

const SECRET = 'revalidate-secret-for-tests'
const PRODUCT_ID = '0f2b6a9e-7c1d-4e5a-9b3c-2d8e1f4a6c7b'

const revalidateTag = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag, revalidatePath }))

const { POST } = await import('./route')

function post(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

const authed = (body: unknown) => post(JSON.stringify(body), { authorization: `Bearer ${SECRET}` })

beforeEach(() => {
  revalidateTag.mockReset()
  revalidatePath.mockReset()
  vi.stubEnv('REVALIDATE_SECRET', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/revalidate: authentication', () => {
  it('is closed when no secret is configured, even to a caller presenting one', async () => {
    vi.stubEnv('REVALIDATE_SECRET', '')
    const res = await POST(authed({ tags: ['home'] }))
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('rejects a missing or wrong bearer', async () => {
    expect((await POST(post(JSON.stringify({ tags: ['home'] })))).status).toBe(401)
    expect(
      (await POST(post(JSON.stringify({ tags: ['home'] }), { authorization: 'Bearer nope' })))
        .status,
    ).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('does not accept CRON_SECRET in place of its own secret', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    const res = await POST(
      post(JSON.stringify({ tags: ['home'] }), { authorization: 'Bearer cron-secret' }),
    )
    expect(res.status).toBe(401)
  })
})

describe('POST /api/revalidate: body contract', () => {
  it('answers 400 on a body that is not JSON', async () => {
    const res = await POST(post('{not json', { authorization: `Bearer ${SECRET}` }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'invalid json' })
  })

  it('answers 400 on an empty request and on unknown keys', async () => {
    expect((await POST(authed({}))).status).toBe(400)
    expect((await POST(authed({ tags: [], paths: [] }))).status).toBe(400)
    expect((await POST(authed({ tag: 'home' }))).status).toBe(400)
  })

  it('refuses an unknown tag and names it, rather than purging a partial set', async () => {
    const res = await POST(authed({ tags: ['home', 'catalog'] }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: 'unknown target',
      tags: ['catalog'],
      paths: [],
    })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('refuses a private path', async () => {
    const res = await POST(authed({ paths: ['/account/orders'] }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ paths: ['/account/orders'] })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('caps the list length', async () => {
    const res = await POST(authed({ tags: Array.from({ length: 65 }, () => 'home') }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/revalidate: accepted calls', () => {
  it('revalidates known tags with the SWR profile and echoes them', async () => {
    const res = await POST(authed({ tags: ['home', `product:${PRODUCT_ID}`, 'home'] }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      revalidated: { tags: ['home', `product:${PRODUCT_ID}`], paths: [] },
    })
    expect(revalidateTag).toHaveBeenCalledTimes(2)
    expect(revalidateTag).toHaveBeenCalledWith('home', 'max')
    expect(revalidateTag).toHaveBeenCalledWith(`product:${PRODUCT_ID}`, 'max')
  })

  it('revalidates storefront paths', async () => {
    const res = await POST(authed({ paths: ['/', '/category/hot-deals'] }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      revalidated: { tags: [], paths: ['/', '/category/hot-deals'] },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/category/hot-deals')
  })

  it('is never shared-cacheable and echoes the request id', async () => {
    const res = await POST(authed({ tags: ['home'] }))
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })
})
