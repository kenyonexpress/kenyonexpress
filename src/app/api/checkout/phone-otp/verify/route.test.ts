/**
 * Tests for checkout phone OTP verification with milestone marking
 * C65: Verifies milestone is marked after successful phone verification
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    update: vi.fn().mockReturnThis(),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/server/checkout/verified-shipping', () => ({
  verifyCheckoutPhoneOtp: vi.fn(),
}))

vi.mock('@/server/verification/user-milestones', () => ({
  markMilestoneVerified: vi.fn(),
}))

vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_: string, handler: never) => handler,
}))

describe('/api/checkout/phone-otp/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks milestone as verified after successful OTP verification', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const { verifyCheckoutPhoneOtp } = await import('@/server/checkout/verified-shipping')
    const { markMilestoneVerified } = await import('@/server/verification/user-milestones')

    const mockUser = { id: 'user-123', email: 'test@example.com' }
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({ data: { user: mockUser } }),
      },
    } as never)

    vi.mocked(verifyCheckoutPhoneOtp).mockResolvedValueOnce('ok')

    const request = new NextRequest('http://localhost/api/checkout/phone-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone: '0501234567', code: '123456' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.ok).toBe(true)
    expect(data.phone).toBe('+972501234567')
    expect(markMilestoneVerified).toHaveBeenCalledWith(
      'user-123',
      'phone_verification_after_5_orders',
      expect.objectContaining({
        phone: '+972501234567',
        method: 'checkout_whatsapp_otp',
        verified_via: 'checkout',
      }),
    )
  })

  it('returns error when OTP verification fails', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const { verifyCheckoutPhoneOtp } = await import('@/server/checkout/verified-shipping')
    const { markMilestoneVerified } = await import('@/server/verification/user-milestones')

    const mockUser = { id: 'user-123', email: 'test@example.com' }
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({ data: { user: mockUser } }),
      },
    } as never)

    vi.mocked(verifyCheckoutPhoneOtp).mockResolvedValueOnce('wrong_code')

    const request = new NextRequest('http://localhost/api/checkout/phone-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone: '0501234567', code: '999999' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.ok).toBe(false)
    expect(data.error).toBe('wrong_code')
    expect(markMilestoneVerified).not.toHaveBeenCalled()
  })

  it('returns 401 when user not authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({ data: { user: null } }),
      },
    } as never)

    const request = new NextRequest('http://localhost/api/checkout/phone-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone: '0501234567', code: '123456' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('unauthenticated')
  })

  it('validates phone format', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const mockUser = { id: 'user-123', email: 'test@example.com' }
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({ data: { user: mockUser } }),
      },
    } as never)

    const request = new NextRequest('http://localhost/api/checkout/phone-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone: 'invalid', code: '123456' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('invalid_phone')
  })

  it('validates code format (6 digits)', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const mockUser = { id: 'user-123', email: 'test@example.com' }
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({ data: { user: mockUser } }),
      },
    } as never)

    const request = new NextRequest('http://localhost/api/checkout/phone-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone: '0501234567', code: '12345' }), // 5 digits
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('invalid_code')
  })
})
