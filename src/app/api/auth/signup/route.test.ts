import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.fn()
const verifyTurnstile = vi.fn()
const getClientIp = vi.fn()
const signUpWithEmail = vi.fn()

vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile, TURNSTILE_FIELD: 'cf-turnstile-response' }))
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp }))
vi.mock('@/server/actions/auth', () => ({ signUpWithEmail }))

const { POST } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.1')
  rateLimit.mockResolvedValue({
    allowed: true,
    limit: 3,
    windowSeconds: 3600,
    remaining: 2,
    resetAtMs: null,
    backend: 'upstash',
  })
  verifyTurnstile.mockResolvedValue(true)
  signUpWithEmail.mockResolvedValue(null)
})

function req(body: Record<string, string>) {
  const formData = new FormData()
  for (const [key, val] of Object.entries(body)) {
    formData.append(key, val)
  }
  return new NextRequest('https://kenyonexpress.co.il/api/auth/signup', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/auth/signup', () => {
  it('applies rate limit of 3 per hour per IP', async () => {
    await POST(
      req({
        full_name: 'Test User',
        email: 'test@example.com',
        phone: '0501234567',
        password: 'password123',
      }),
    )
    expect(rateLimit).toHaveBeenCalledWith('signup', '203.0.113.1')
  })

  it('returns 429 when rate limited', async () => {
    rateLimit.mockResolvedValue({
      allowed: false,
      limit: 3,
      windowSeconds: 3600,
      remaining: 0,
      resetAtMs: null,
      backend: 'upstash',
    })
    const res = await POST(
      req({ full_name: 'Test', email: 'test@example.com', phone: '0501234567', password: 'pass' }),
    )
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('שעה') })
  })

  it('verifies Turnstile token', async () => {
    await POST(
      req({
        full_name: 'Test',
        email: 'test@example.com',
        phone: '0501234567',
        password: 'pass',
        'cf-turnstile-response': 'token123',
      }),
    )
    expect(verifyTurnstile).toHaveBeenCalledWith('token123', '203.0.113.1')
  })
})
