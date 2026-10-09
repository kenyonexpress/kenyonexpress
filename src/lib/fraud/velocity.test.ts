import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkCheckoutVelocity, normalizeVelocityEmail, normalizeVelocityPhone } from './velocity'

const rateLimitMock = vi.fn()
vi.mock('@/lib/rate-limit/limiter', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}))

function decision(allowed: boolean) {
  return {
    allowed,
    limit: 15,
    windowSeconds: 86400,
    remaining: null,
    resetAtMs: null,
    backend: 'upstash',
  }
}

beforeEach(() => {
  rateLimitMock.mockReset()
  rateLimitMock.mockResolvedValue(decision(true))
})

describe('normalizeVelocityEmail', () => {
  it('folds casing and whitespace into one bucket', () => {
    expect(normalizeVelocityEmail('  Ofir@Example.COM ')).toBe('ofir@example.com')
  })

  it('returns null for missing or empty input', () => {
    expect(normalizeVelocityEmail(null)).toBeNull()
    expect(normalizeVelocityEmail(undefined)).toBeNull()
    expect(normalizeVelocityEmail('   ')).toBeNull()
  })
})

describe('normalizeVelocityPhone', () => {
  it('folds the international prefix into the local form', () => {
    expect(normalizeVelocityPhone('+972 50-123-4567')).toBe('0501234567')
    expect(normalizeVelocityPhone('050-1234567')).toBe('0501234567')
  })

  it('does not mistake a local number starting with 972 for a prefix', () => {
    // Nine digits: too short to carry the country code plus a full number.
    expect(normalizeVelocityPhone('972-123-456')).toBe('972123456')
  })

  it('returns null when no digits remain', () => {
    expect(normalizeVelocityPhone(null)).toBeNull()
    expect(normalizeVelocityPhone('---')).toBeNull()
  })
})

describe('checkCheckoutVelocity', () => {
  const identity = { ip: '203.0.113.9', email: 'a@b.co', phone: '0501234567' }

  it('spends all three buckets, in ip-email-phone order, when all allow', async () => {
    const result = await checkCheckoutVelocity(identity)
    expect(result).toEqual({ ok: true })
    expect(rateLimitMock.mock.calls.map((c) => c[0])).toEqual([
      'checkout-velocity-ip',
      'checkout-velocity-email',
      'checkout-velocity-phone',
    ])
    expect(rateLimitMock.mock.calls.map((c) => c[1])).toEqual([
      identity.ip,
      identity.email,
      identity.phone,
    ])
  })

  it('skips a missing dimension instead of counting it as a literal null', async () => {
    const result = await checkCheckoutVelocity({ ...identity, phone: null })
    expect(result).toEqual({ ok: true })
    expect(rateLimitMock).toHaveBeenCalledTimes(2)
  })

  it('names the dimension that refused and stops spending the rest', async () => {
    rateLimitMock.mockResolvedValueOnce(decision(true)).mockResolvedValueOnce(decision(false))
    const result = await checkCheckoutVelocity(identity)
    expect(result).toEqual({ ok: false, dimension: 'email' })
    // The phone bucket of whoever the caller impersonates is not spent.
    expect(rateLimitMock).toHaveBeenCalledTimes(2)
  })

  it('passes nowMs through to the limiter', async () => {
    await checkCheckoutVelocity({ ip: '1.2.3.4', email: null, phone: null }, { nowMs: 1234 })
    expect(rateLimitMock).toHaveBeenCalledWith('checkout-velocity-ip', '1.2.3.4', { nowMs: 1234 })
  })
})
