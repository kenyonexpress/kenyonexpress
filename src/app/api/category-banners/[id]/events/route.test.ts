import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The banner counter route (STEP 62). The route is a thin shell over
 * `record_category_banner_event`; what matters here is what it refuses to do:
 * serve over the ceiling, accept a malformed id or an unknown kind, let a
 * shared cache keep a response, or tell a probe whether a banner exists.
 */

const rateLimit = vi.fn()
const getClientIp = vi.fn()
const rpc = vi.fn()
const warn = vi.fn()

function decision(allowed: boolean) {
  return {
    allowed,
    limit: 60,
    windowSeconds: 60,
    remaining: allowed ? 59 : 0,
    resetAtMs: Date.now() + 60_000,
    backend: 'upstash' as const,
  }
}

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  rateLimit: (...args: unknown[]) => rateLimit(...args),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp: () => getClientIp() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: (...a: unknown[]) => warn(...a),
    error: vi.fn(),
  },
}))

const { POST } = await import('./route')

const BANNER = '11111111-1111-4111-8111-111111111111'

function call(id: string, body: unknown) {
  const request = new NextRequest(`https://kenyonexpress.co.il/api/category-banners/${id}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return POST(request, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.7')
  rateLimit.mockResolvedValue(decision(true))
  rpc.mockResolvedValue({ data: true, error: null })
})

describe('POST /api/category-banners/[id]/events', () => {
  it('counts a click through the service-role function and answers 204, never cacheable', async () => {
    const response = await call(BANNER, { kind: 'click' })
    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(rateLimit).toHaveBeenCalledWith('banner-event', '203.0.113.7')
    expect(rpc).toHaveBeenCalledWith('record_category_banner_event', {
      p_banner: BANNER,
      p_kind: 'click',
    })
  })

  it('counts an impression too', async () => {
    const response = await call(BANNER, { kind: 'impression' })
    expect(response.status).toBe(204)
    expect(rpc).toHaveBeenCalledWith('record_category_banner_event', {
      p_banner: BANNER,
      p_kind: 'impression',
    })
  })

  it('refuses over the ceiling before touching the database', async () => {
    rateLimit.mockResolvedValue(decision(false))
    const response = await call(BANNER, { kind: 'click' })
    expect(response.status).toBe(429)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a malformed id, an unknown kind and a body that is not JSON', async () => {
    expect((await call('not-a-uuid', { kind: 'click' })).status).toBe(400)
    expect((await call(BANNER, { kind: 'hover' })).status).toBe(400)
    expect((await call(BANNER, 'not json')).status).toBe(400)
    expect((await call(BANNER, {})).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 204 whether or not the banner exists, and on the absent schema without a warning', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect((await call(BANNER, { kind: 'click' })).status).toBe(204)

    rpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function does not exist' },
    })
    expect((await call(BANNER, { kind: 'click' })).status).toBe(204)
    expect(warn).not.toHaveBeenCalled()

    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling' } })
    expect((await call(BANNER, { kind: 'click' })).status).toBe(204)
    expect(warn).toHaveBeenCalledWith(
      'category_banners.event_write_failed',
      expect.objectContaining({ kind: 'click' }),
    )
  })
})
