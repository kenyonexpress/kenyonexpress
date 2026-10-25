import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.fn()
const verifyTurnstile = vi.fn()
const getClientIp = vi.fn()
const signInWithEmail = vi.fn()

vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile, TURNSTILE_FIELD: 'cf-turnstile-response' }))
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp }))
vi.mock('@/server/actions/auth', () => ({ signInWithEmail }))

const { POST } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.1')
  rateLimit.mockResolvedValue({
    allowed: true,
    limit: 5,
    windowSeconds: 900,
    remaining: 4,
    resetAtMs: null,
    backend: 'upstash',
  })
  verifyTurnstile.mockResolvedValue(true)
  signInWithEmail.mockResolvedValue(null)
})

function req(body: Record<string, string>) {
  const formData = new FormData()
  for (const [key, val] of Object.entries(body)) {
    formData.append(key, val)
  }
  return new NextRequest('https://kenyonexpress.co.il/api/auth/login', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/auth/login', () => {
  it('applies rate limit of 5 per 15min per IP', async () => {
    await POST(req({ email: 'test@example.com', password: 'password' }))
    expect(rateLimit).toHaveBeenCalledWith('login', '203.0.113.1')
  })

  it('returns 429 when rate limited', async () => {
    rateLimit.mockResolvedValue({
      allowed: false,
      limit: 5,
      windowSeconds: 900,
      remaining: 0,
      resetAtMs: null,
      backend: 'upstash',
    })
    const res = await POST(req({ email: 'test@example.com', password: 'password' }))
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('15 דקות') })
  })

  it('verifies Turnstile token', async () => {
    await POST(
      req({ email: 'test@example.com', password: 'password', 'cf-turnstile-response': 'token123' }),
    )
    expect(verifyTurnstile).toHaveBeenCalledWith('token123', '203.0.113.1')
  })

  it('returns 400 when Turnstile fails', async () => {
    verifyTurnstile.mockResolvedValue(false)
    const res = await POST(req({ email: 'test@example.com', password: 'password' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('אנושיות') })
  })

  it('delegates to signInWithEmail', async () => {
    await POST(req({ email: 'test@example.com', password: 'password' }))
    expect(signInWithEmail).toHaveBeenCalledWith(null, expect.any(FormData))
  })

  it('returns error from action', async () => {
    signInWithEmail.mockResolvedValue({ error: 'Invalid credentials' })
    const res = await POST(req({ email: 'test@example.com', password: 'wrong' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'Invalid credentials' })
  })
})
