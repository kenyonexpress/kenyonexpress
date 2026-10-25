import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.fn()
const verifyTurnstile = vi.fn()
const getClientIp = vi.fn()
const sendPasswordReset = vi.fn()

vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile, TURNSTILE_FIELD: 'cf-turnstile-response' }))
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp }))
vi.mock('@/server/actions/auth', () => ({ sendPasswordReset }))

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
  sendPasswordReset.mockResolvedValue(null)
})

function req(body: Record<string, string>) {
  const formData = new FormData()
  for (const [key, val] of Object.entries(body)) {
    formData.append(key, val)
  }
  return new NextRequest('https://kenyonexpress.co.il/api/auth/forgot-password', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/auth/forgot-password', () => {
  it('applies rate limit of 3 per hour per IP', async () => {
    await POST(req({ email: 'test@example.com' }))
    expect(rateLimit).toHaveBeenCalledWith('reset', '203.0.113.1')
  })

  it('applies rate limit of 3 per hour per email', async () => {
    await POST(req({ email: 'Test@Example.com' }))
    expect(rateLimit).toHaveBeenNthCalledWith(2, 'reset-address', 'test@example.com')
  })

  it('returns 429 when IP rate limited', async () => {
    rateLimit.mockResolvedValue({
      allowed: false,
      limit: 3,
      windowSeconds: 3600,
      remaining: 0,
      resetAtMs: null,
      backend: 'upstash',
    })
    const res = await POST(req({ email: 'test@example.com' }))
    expect(res.status).toBe(429)
  })

  it('returns neutral message when email rate limited', async () => {
    rateLimit.mockResolvedValueOnce({
      allowed: true,
      limit: 3,
      windowSeconds: 3600,
      remaining: 2,
      resetAtMs: null,
      backend: 'upstash',
    })
    rateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 3,
      windowSeconds: 3600,
      remaining: 0,
      resetAtMs: null,
      backend: 'upstash',
    })
    const res = await POST(req({ email: 'test@example.com' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toHaveProperty('message')
  })

  it('verifies Turnstile token', async () => {
    await POST(req({ email: 'test@example.com', 'cf-turnstile-response': 'token123' }))
    expect(verifyTurnstile).toHaveBeenCalledWith('token123', '203.0.113.1')
  })
})
