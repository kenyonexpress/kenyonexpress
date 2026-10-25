import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.fn()
const verifyTurnstile = vi.fn()
const getClientIp = vi.fn()
const submitContactForm = vi.fn()

vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile, TURNSTILE_FIELD: 'cf-turnstile-response' }))
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp }))
vi.mock('@/server/actions/contact', () => ({ submitContactForm }))

const { POST } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.1')
  rateLimit.mockResolvedValue({
    allowed: true,
    limit: 5,
    windowSeconds: 3600,
    remaining: 4,
    resetAtMs: null,
    backend: 'upstash',
  })
  verifyTurnstile.mockResolvedValue(true)
  submitContactForm.mockResolvedValue({ ok: true, message: 'תודה' })
})

function req(body: Record<string, string>) {
  const formData = new FormData()
  for (const [key, val] of Object.entries(body)) {
    formData.append(key, val)
  }
  return new NextRequest('https://kenyonexpress.co.il/api/contact', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/contact', () => {
  it('applies rate limit of 5 per hour per IP', async () => {
    await POST(
      req({ channel: 'general', name: 'Test', email: 'test@example.com', message: 'Hello' }),
    )
    expect(rateLimit).toHaveBeenCalledWith('contact', '203.0.113.1')
  })

  it('returns 429 when rate limited', async () => {
    rateLimit.mockResolvedValue({
      allowed: false,
      limit: 5,
      windowSeconds: 3600,
      remaining: 0,
      resetAtMs: null,
      backend: 'upstash',
    })
    const res = await POST(
      req({ channel: 'general', name: 'Test', email: 'test@example.com', message: 'Hello' }),
    )
    expect(res.status).toBe(429)
  })

  it('verifies Turnstile token', async () => {
    await POST(
      req({
        channel: 'general',
        name: 'Test',
        email: 'test@example.com',
        message: 'Hello',
        'cf-turnstile-response': 'token123',
      }),
    )
    expect(verifyTurnstile).toHaveBeenCalledWith('token123', '203.0.113.1')
  })

  it('delegates to submitContactForm', async () => {
    await POST(
      req({ channel: 'general', name: 'Test', email: 'test@example.com', message: 'Hello' }),
    )
    expect(submitContactForm).toHaveBeenCalledWith({ ok: false }, expect.objectContaining({}))
  })
})
