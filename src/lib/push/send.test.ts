import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPushToUser, sendPushToUsers } from './send'

vi.mock('web-push')
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: table === 'push_subscriptions' ? [] : undefined,
          error: null,
        }),
        delete: vi.fn().mockResolvedValue({ error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })),
  })),
}))

describe('Push notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // supabase-js is mocked above, but createAdminClient still refuses to build
    // without a key. A placeholder keeps the test independent of the machine's .env.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
  })

  it('sendPushToUser returns sent/failed counts', async () => {
    const result = await sendPushToUser('user-123', {
      title: 'Test',
      body: 'Test notification',
    })

    expect(result).toEqual({ sent: 0, failed: 0 })
  })

  it('sendPushToUsers aggregates results from multiple users', async () => {
    const result = await sendPushToUsers(['user-1', 'user-2'], {
      title: 'Test',
      body: 'Test notification',
    })

    expect(result).toEqual({ sent: 0, failed: 0 })
  })

  it('handles notification with all optional fields', async () => {
    const result = await sendPushToUser('user-123', {
      title: 'Order Shipped',
      body: 'Your order is on its way',
      icon: '/icon.png',
      badge: '/badge.png',
      data: { url: '/account/orders/123' },
    })

    expect(result).toBeDefined()
  })
})
