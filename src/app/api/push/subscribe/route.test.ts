import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const upsert = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ error: null })))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (_token) => ({
        data: { user: { id: 'user-123' } },
        error: null,
      })),
    },
    from: vi.fn((_table) => ({
      upsert,
    })),
  })),
}))

describe('POST /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // supabase-js is mocked above, but the route still refuses to build a client
    // without a key. A placeholder keeps the test independent of the machine's .env.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
  })

  it('rejects invalid subscription', async () => {
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({ endpoint: null }),
    })

    const response = await POST(request as any)
    expect(response.status).toBe(400)
  })

  it('rejects missing authorization', async () => {
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key', auth: 'secret' },
      }),
    })

    const response = await POST(request as any)
    expect(response.status).toBe(401)
  })

  it('accepts valid subscription with authorization', async () => {
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: 'https://fcm.googleapis.com/...',
        keys: { p256dh: 'base64key', auth: 'base64secret' },
      }),
    })

    const response = await POST(request as any)
    expect(response.status).toBe(200)
  })
  it('writes the live column names and conflicts on endpoint', async () => {
    // 290's table has p256dh/auth and a unique endpoint. keys_p256dh/keys_auth
    // and (user_id, endpoint) match nothing there and answered 500.
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
      body: JSON.stringify({
        endpoint: 'https://fcm.googleapis.com/x',
        keys: { p256dh: 'k', auth: 's' },
      }),
    })
    await POST(request as any)
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-123', endpoint: 'https://fcm.googleapis.com/x', p256dh: 'k', auth: 's' },
      { onConflict: 'endpoint' },
    )
  })
})
