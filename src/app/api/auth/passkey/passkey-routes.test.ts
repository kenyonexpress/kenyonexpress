import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: async () => true,
  getClientIp: async () => '1.1.1.1',
}))
vi.mock('@/server/auth/mint-session', () => ({ mintSessionFor: vi.fn() }))
vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_n: string, h: unknown) => h,
}))

import { POST as authenticate } from './authenticate/route'
import { POST as register } from './register/route'

function req(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/auth/passkey/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('PASSKEY_CHALLENGE_SECRET', 'x'.repeat(32))
  getUser.mockReset()
  maybeSingle.mockReset()
})

describe('passkeys_enabled flag', () => {
  it('404s both routes when switched off', async () => {
    vi.stubEnv('NEXT_PUBLIC_PASSKEYS_ENABLED', 'false')
    expect((await authenticate(req('authenticate', { step: 'options' }))).status).toBe(404)
    expect((await register(req('register', { step: 'options' }))).status).toBe(404)
  })
})

describe('authenticate', () => {
  it('issues options and a signed challenge cookie by default', async () => {
    const res = await authenticate(req('authenticate', { step: 'options' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.options.challenge).toBeTruthy()
    expect(res.headers.get('set-cookie')).toContain('ke_wa_chal=')
  })
  it('rejects verify without a challenge cookie', async () => {
    const res = await authenticate(req('authenticate', { step: 'verify', response: { id: 'abc' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('challenge_expired')
  })
  it('rejects an unknown step', async () => {
    expect((await authenticate(req('authenticate', { step: 'nope' }))).status).toBe(400)
  })
})

describe('register', () => {
  it('requires a signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await register(req('register', { step: 'options' }))).status).toBe(401)
  })
  it('rejects verify without a challenge cookie', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await register(req('register', { step: 'verify', response: {} }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('challenge_expired')
  })
})
