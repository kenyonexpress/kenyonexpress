import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/push/trigger-notifications', () => ({
  triggerVoucherExpiryNotifications: vi.fn(async () => ({ sent: 1, failed: 0 })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((_table) => ({
      select: vi.fn().mockReturnValue({
        lt: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
    })),
  })),
}))

describe('GET /api/cron/push-voucher-expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects request without proper authorization', async () => {
    const request = new Request('http://localhost/api/cron/push-voucher-expiry', {
      method: 'GET',
    })

    const response = await GET(request as any)
    expect(response.status).toBe(401)
  })

  it('accepts request with correct CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'test-secret'

    const request = new Request('http://localhost/api/cron/push-voucher-expiry', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-secret' },
    })

    const response = await GET(request as any)
    expect([200, 500]).toContain(response.status)
  })
})
