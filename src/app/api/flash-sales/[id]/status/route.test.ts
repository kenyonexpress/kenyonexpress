import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The waiting room's poll (STEP 61). The route is a thin shell over
 * `readFlashStatus`; what matters here is what it refuses to do: serve over
 * the ceiling, accept a malformed id, let a shared cache keep a per-visitor
 * body, or take the user from anywhere but the session.
 */

const rateLimit = vi.fn()
const getClientIp = vi.fn()
const readFlashStatus = vi.fn()
const getUser = vi.fn()

function decision(allowed: boolean) {
  return {
    allowed,
    limit: 120,
    windowSeconds: 60,
    remaining: allowed ? 119 : 0,
    resetAtMs: Date.now() + 60_000,
    backend: 'upstash' as const,
  }
}

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  rateLimit: (...args: unknown[]) => rateLimit(...args),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp: () => getClientIp() }))
vi.mock('@/lib/flash-sales/status', () => ({
  readFlashStatus: (...args: unknown[]) => readFlashStatus(...args),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))

const { GET } = await import('./route')

const SALE = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

function call(id: string) {
  const request = new NextRequest(`https://kenyonexpress.co.il/api/flash-sales/${id}/status`)
  return GET(request, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.7')
  rateLimit.mockResolvedValue(decision(true))
  getUser.mockResolvedValue({ data: { user: null } })
  readFlashStatus.mockResolvedValue({
    phase: 'live',
    remaining: 3,
    allocation: 10,
    claim: null,
    starts_at: '2026-10-08T11:00:00Z',
    ends_at: '2026-10-08T13:00:00Z',
    server_now: '2026-10-08T12:00:00Z',
  })
})

describe('GET /api/flash-sales/[id]/status', () => {
  it('answers 429 over the ceiling before reading anything', async () => {
    rateLimit.mockResolvedValue(decision(false))
    const response = await call(SALE)
    expect(response.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith('flash-status', '203.0.113.7')
    expect(readFlashStatus).not.toHaveBeenCalled()
  })

  it('refuses a malformed id with 400', async () => {
    const response = await call('not-a-uuid')
    expect(response.status).toBe(400)
    expect(readFlashStatus).not.toHaveBeenCalled()
  })

  it('answers 404 for a sale the read does not know', async () => {
    readFlashStatus.mockResolvedValue(null)
    expect((await call(SALE)).status).toBe(404)
  })

  it('reads with the session user, never a query parameter, and is never shared-cached', async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER } } })
    const response = await call(SALE)
    expect(response.status).toBe(200)
    expect(readFlashStatus).toHaveBeenCalledWith(SALE, USER)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = (await response.json()) as { remaining: number; claim: unknown }
    expect(body.remaining).toBe(3)
    expect(body.claim).toBeNull()
  })

  it('answers a guest with the aggregate and a null user', async () => {
    const response = await call(SALE)
    expect(response.status).toBe(200)
    expect(readFlashStatus).toHaveBeenCalledWith(SALE, null)
  })
})
