import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (_token) => ({
        data: { user: { id: 'user-123' } },
        error: null,
      })),
    },
    from: vi.fn((_table) => ({
      upsert: vi.fn(async () => ({ error: null })),
    })),
  })),
}))

describe('POST /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
