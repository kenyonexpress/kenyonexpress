import { looksLikeDemoValue, probeEnvironment } from '@/lib/env-probe'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The probe exists because shape validation ran out of road.
 *
 * `env.ts` checks presence, `admin-key.ts` decodes a JWT and catches the stock
 * `iss=supabase-demo` key. Neither can see a NEW-format `sb_secret_...` key that
 * is present, well-formed, not a demo value, and rejected by the project --
 * which is exactly what was in `.env.local` on 2026-09-04, returning 401 from
 * /rest/v1, /auth/v1/settings and /auth/v1/admin/users alike while every admin
 * path failed silently underneath it.
 */

const ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-that-is-long-enough',
  SUPABASE_SECRET_KEY: 'sb_secret_opaque_and_well_formed',
}

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number) {
  const fetchMock = vi.fn((..._args: unknown[]) => Promise.resolve(new Response('', { status })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('probeEnvironment', () => {
  it('reports a key the project rejects, which no shape check can see', async () => {
    stubFetch(401)
    const results = await probeEnvironment(ENV)
    const broken = results.filter((r) => !r.ok)
    expect(broken.map((r) => r.variable)).toContain('SUPABASE_SECRET_KEY')
    expect(broken[0]?.detail).toContain('הפרויקט דחה את המפתח')
  })

  it('passes a key the project accepts', async () => {
    stubFetch(200)
    const results = await probeEnvironment(ENV)
    expect(results.filter((r) => !r.ok)).toEqual([])
  })

  it('asks /auth/v1/settings, the endpoint measured to discriminate', async () => {
    // /rest/v1/?select=1 returns 401 for a perfectly good anon key. The first
    // version of this probe used it and reported the WORKING key as broken on
    // its first real boot. The endpoint is part of the contract.
    const fetchMock = stubFetch(200)
    await probeEnvironment(ENV)
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('/auth/v1/settings')
    }
  })

  it('does not blame the key for a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      }),
    )
    const results = await probeEnvironment(ENV)
    expect(results.filter((r) => !r.ok)).toEqual([])
    expect(results.some((r) => r.detail.includes('אינה עדות'))).toBe(true)
  })

  it('reports a missing variable without a network call', async () => {
    const fetchMock = stubFetch(200)
    const results = await probeEnvironment({ ...ENV, SUPABASE_SECRET_KEY: undefined })
    // Falls back to SUPABASE_SERVICE_ROLE_KEY, which is also absent.
    expect(results.some((r) => !r.ok && r.detail === 'חסר לגמרי.')).toBe(true)
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes('secret'))).toBe(true)
  })

  it('catches a placeholder that is the right shape and the wrong value', async () => {
    stubFetch(200)
    const results = await probeEnvironment({
      ...ENV,
      SUPABASE_SECRET_KEY: 'sb_secret_your-service-role-key',
    })
    expect(results.some((r) => !r.ok && r.detail.includes('ערך דמו'))).toBe(true)
  })
})

describe('looksLikeDemoValue', () => {
  it.each(['your-project', 'CHANGEME', 'https://example.supabase.co', 'iss=supabase-demo'])(
    'flags %s',
    (value) => expect(looksLikeDemoValue(value)).toBe(true),
  )

  it('does not flag a real key', () => {
    expect(looksLikeDemoValue('sb_secret_y4RealLookingValue')).toBe(false)
  })
})
