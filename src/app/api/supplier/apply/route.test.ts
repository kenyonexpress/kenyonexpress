import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.fn()
const verifyTurnstile = vi.fn()
const getClientIp = vi.fn()
const submitSupplierLead = vi.fn()

vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile, TURNSTILE_FIELD: 'cf-turnstile-response' }))
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp }))
vi.mock('@/server/actions/supplier-lead', () => ({ submitSupplierLead }))

const { POST } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.1')
  rateLimit.mockResolvedValue({
    allowed: true,
    limit: 2,
    windowSeconds: 86400,
    remaining: 1,
    resetAtMs: null,
    backend: 'upstash',
  })
  verifyTurnstile.mockResolvedValue(true)
  submitSupplierLead.mockResolvedValue({ ok: true, message: 'תודה' })
})

function req(body: Record<string, string>) {
  const formData = new FormData()
  for (const [key, val] of Object.entries(body)) {
    formData.append(key, val)
  }
  return new NextRequest('https://kenyonexpress.co.il/api/supplier/apply', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/supplier/apply', () => {
  it('applies rate limit of 2 per 24h per IP', async () => {
    await POST(
      req({
        business_name: 'Test Co',
        contact_name: 'Test',
        email: 'test@example.com',
        phone: '0501234567',
        agreement: 'on',
        agreement_hash: 'abc123',
      }),
    )
    expect(rateLimit).toHaveBeenCalledWith('supplier-lead', '203.0.113.1')
  })

  it('returns 429 when rate limited', async () => {
    rateLimit.mockResolvedValue({
      allowed: false,
      limit: 2,
      windowSeconds: 86400,
      remaining: 0,
      resetAtMs: null,
      backend: 'upstash',
    })
    const res = await POST(
      req({
        business_name: 'Test',
        contact_name: 'Test',
        email: 'test@example.com',
        phone: '0501234567',
        agreement: 'on',
        agreement_hash: 'abc',
      }),
    )
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('מחר') })
  })

  it('verifies Turnstile token', async () => {
    await POST(
      req({
        business_name: 'Test',
        contact_name: 'Test',
        email: 'test@example.com',
        phone: '0501234567',
        agreement: 'on',
        agreement_hash: 'abc',
        'cf-turnstile-response': 'token123',
      }),
    )
    expect(verifyTurnstile).toHaveBeenCalledWith('token123', '203.0.113.1')
  })
})
