import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

describe('/api/cron/cart-abandonment', () => {
  it('returns 401 without CRON_SECRET', async () => {
    const { GET } = await import('./route')
    const request = new NextRequest('http://localhost/api/cron/cart-abandonment')
    const response = await GET(request)
    expect(response.status).toBe(401)
  })

  it('returns 401 with wrong CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret')
    const { GET } = await import('./route')
    const request = new NextRequest('http://localhost/api/cron/cart-abandonment', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const response = await GET(request)
    expect(response.status).toBe(401)
    vi.unstubAllEnvs()
  })

  it('accepts correct CRON_SECRET', async () => {
    // Skip if no DB credentials (e.g. CI without secrets)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
      return
    }

    vi.stubEnv('CRON_SECRET', 'test-secret')
    const { GET } = await import('./route')
    const request = new NextRequest('http://localhost/api/cron/cart-abandonment', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const response = await GET(request)
    // May be 200 or 500 depending on DB availability, but not 401
    expect(response.status).not.toBe(401)
    vi.unstubAllEnvs()
  })
})
