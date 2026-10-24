import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

import { POST } from './route'

function req(): NextRequest {
  return new NextRequest('http://localhost/api/supplier/verify-card', {
    method: 'POST',
    headers: { 'idempotency-key': 'key-12345678' },
  })
}

describe('supplier verify-card alias', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('404s unless CARD_VERIFY_STUB_ENABLED=true', async () => {
    vi.stubEnv('CARD_VERIFY_STUB_ENABLED', 'false')
    expect((await POST(req())).status).toBe(404)
  })

  it('verifies without charging when enabled', async () => {
    vi.stubEnv('CARD_VERIFY_STUB_ENABLED', 'true')
    const body = await (await POST(req())).json()
    expect(body).toMatchObject({ status: 'verified', amountAgorot: 100, charged: false })
  })
})
