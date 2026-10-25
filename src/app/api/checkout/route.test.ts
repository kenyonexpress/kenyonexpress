import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.fn()
const createClient = vi.fn()
const beginCheckout = vi.fn()

vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/server/actions/payments/checkout', () => ({ beginCheckout }))

const { POST } = await import('./route')

const mockUser = { id: 'user-123', email: 'test@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
    },
  })
  rateLimit.mockResolvedValue({
    allowed: true,
    limit: 10,
    windowSeconds: 3600,
    remaining: 9,
    resetAtMs: Date.now() + 3600000,
    backend: 'upstash',
  })
  beginCheckout.mockResolvedValue({ ok: true, data: { paymentUrl: 'https://pay.example.com' } })
})

function req(body: object) {
  return new NextRequest('https://kenyonexpress.co.il/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/checkout', () => {
  it('applies rate limit of 10 per hour per user', async () => {
    await POST(req({ items: [] }))
    expect(rateLimit).toHaveBeenCalledWith('begin_checkout', 'user-123')
  })

  it('returns 401 when not authenticated', async () => {
    createClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })
    const res = await POST(req({ items: [] }))
    expect(res.status).toBe(401)
  })

  it('returns 429 with rate limit headers when limited', async () => {
    rateLimit.mockResolvedValue({
      allowed: false,
      limit: 10,
      windowSeconds: 3600,
      remaining: 0,
      resetAtMs: Date.now() + 1800000,
      backend: 'upstash',
    })
    const res = await POST(req({ items: [] }))
    expect(res.status).toBe(429)
    expect(res.headers.get('RateLimit-Limit')).toBe('10')
    expect(res.headers.get('RateLimit-Remaining')).toBe('0')
  })
})
