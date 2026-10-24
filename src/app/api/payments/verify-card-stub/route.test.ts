import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let user: { id: string } | null = { id: 'user-1' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))

import { POST } from './route'

function req(key?: string): NextRequest {
  return new NextRequest('http://localhost/api/payments/verify-card-stub', {
    method: 'POST',
    headers: key ? { 'idempotency-key': key } : {},
  })
}

describe('verify-card-stub', () => {
  beforeEach(() => {
    user = { id: 'user-1' }
    vi.stubEnv('CARD_VERIFY_STUB_ENABLED', 'true')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('404s when the flag is off', async () => {
    vi.stubEnv('CARD_VERIFY_STUB_ENABLED', 'false')
    expect((await POST(req('key-12345678'))).status).toBe(404)
  })

  it('401s without a session', async () => {
    user = null
    expect((await POST(req('key-12345678'))).status).toBe(401)
  })

  it('400s without a valid idempotency key', async () => {
    expect((await POST(req())).status).toBe(400)
    expect((await POST(req('short'))).status).toBe(400)
  })

  it('returns an identical uncharged 100 agorot body for a repeated key', async () => {
    const a = await (await POST(req('key-12345678'))).json()
    const b = await (await POST(req('key-12345678'))).json()
    expect(a).toEqual(b)
    expect(a).toMatchObject({ status: 'verified', amountAgorot: 100, charged: false })
    const c = await (await POST(req('key-87654321'))).json()
    expect(c.verificationId).not.toBe(a.verificationId)
  })
})
