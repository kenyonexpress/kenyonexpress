import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({ log: { error: vi.fn() } }))
vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_p: string, h: (r: NextRequest) => unknown) => h,
}))

const mockSupabaseData = vi.fn()
const mockSupabaseDelete = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'push_subscriptions'
        ? {
            select: () => ({
              order: () => ({
                limit: () => ({
                  data: mockSupabaseData(),
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              in: mockSupabaseDelete,
            }),
          }
        : {},
  }),
}))

const mockWebPushResult = vi.fn()
vi.mock('@/lib/push/web-push', () => ({
  sendWebPush: vi.fn(async () => mockWebPushResult()),
}))

vi.mock('@/lib/security/constant-time', () => ({
  bearerMatches: (header: string | null, secret: string) =>
    header === `Bearer ${secret}` || (header === 'Bearer test-secret' && secret === 'test-secret'),
}))

describe('/api/test/push-verify', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    mockSupabaseData.mockReset()
    mockSupabaseDelete.mockReset()
    mockWebPushResult.mockReset()
  })

  it('requires CRON_SECRET authentication', async () => {
    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/test/push-verify', {
      headers: { authorization: 'Bearer wrong-secret' },
    }) as NextRequest
    const response = await GET(req)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('returns 404 when no subscriptions exist', async () => {
    mockSupabaseData.mockReturnValue([])
    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/test/push-verify', {
      headers: { authorization: 'Bearer test-secret' },
    }) as NextRequest
    const response = await GET(req)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body).toMatchObject({
      ok: false,
      error: 'no_subscriptions',
    })
  })

  it('sends test notification to one subscriber', async () => {
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test123',
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-secret',
      user_id: 'user-123',
    }
    mockSupabaseData.mockReturnValue([subscription])
    mockWebPushResult.mockResolvedValue({
      ok: true,
      sent: 1,
      failed: 0,
      deadEndpoints: [],
    })

    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/test/push-verify', {
      headers: { authorization: 'Bearer test-secret' },
    }) as NextRequest
    const response = await GET(req)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      ok: true,
      sent: 1,
      failed: 0,
      deadEndpoints: 0,
      user_id: 'user-123',
      message: 'Test notification sent successfully',
    })
  })

  it('handles push service errors', async () => {
    mockSupabaseData.mockReturnValue([
      { endpoint: 'https://push.example/test', p256dh: 'k', auth: 'a', user_id: 'u1' },
    ])
    mockWebPushResult.mockResolvedValue({
      ok: false,
      skipped: true,
      reason: 'VAPID keys not configured',
    })

    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/test/push-verify', {
      headers: { authorization: 'Bearer test-secret' },
    }) as NextRequest
    const response = await GET(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({
      ok: false,
      skipped: true,
      reason: 'VAPID keys not configured',
    })
  })

  it('cleans up dead endpoints', async () => {
    mockSupabaseData.mockReturnValue([
      { endpoint: 'https://push.dead/endpoint', p256dh: 'k', auth: 'a', user_id: 'u1' },
    ])
    mockWebPushResult.mockResolvedValue({
      ok: true,
      sent: 0,
      failed: 0,
      deadEndpoints: ['https://push.dead/endpoint'],
    })
    mockSupabaseDelete.mockResolvedValue({ error: null })

    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/test/push-verify', {
      headers: { authorization: 'Bearer test-secret' },
    }) as NextRequest
    const response = await GET(req)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.deadEndpoints).toBe(1)
    expect(mockSupabaseDelete).toHaveBeenCalledWith('endpoint', ['https://push.dead/endpoint'])
  })
})
