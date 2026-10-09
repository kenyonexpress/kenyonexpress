import { createRequestIdFetch } from '@/lib/supabase/request-id-fetch'
import { describe, expect, it, vi } from 'vitest'

// The wrapper resolves the id per call, so the mock exposes a knob rather
// than a constant: the same wrapped fetch must behave differently inside and
// outside a request.
let currentId: string | null = null
vi.mock('@/lib/observability/request-context', () => ({
  getRequestId: () => currentId,
}))

function recorder() {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
  const base = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init })
    return Promise.resolve(new Response('{}'))
  }) as typeof fetch
  return { base, calls }
}

describe('outside a request', () => {
  it('passes the call through untouched — no header invented, init not rebuilt', async () => {
    currentId = null
    const { base, calls } = recorder()
    const wrapped = createRequestIdFetch(base)
    const init = { method: 'POST' }
    await wrapped('https://db.test/rest/v1/orders', init)
    // The exact same init object: a script or a test sees fetch exactly as
    // supabase-js issued it.
    expect(calls[0]?.init).toBe(init)
  })
})

describe('inside a request', () => {
  it('adds x-request-id and keeps the headers supabase-js set', async () => {
    currentId = 'req-abc-123'
    const { base, calls } = recorder()
    const wrapped = createRequestIdFetch(base)
    await wrapped('https://db.test/rest/v1/orders', {
      headers: { apikey: 'k', 'content-type': 'application/json' },
    })
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('x-request-id')).toBe('req-abc-123')
    expect(headers.get('apikey')).toBe('k')
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('does not overwrite an id someone set deliberately', async () => {
    currentId = 'ambient-id'
    const { base, calls } = recorder()
    const wrapped = createRequestIdFetch(base)
    await wrapped('https://db.test/rest/v1/orders', {
      headers: { 'x-request-id': 'explicit-id' },
    })
    expect(new Headers(calls[0]?.init?.headers).get('x-request-id')).toBe('explicit-id')
  })

  // fetch ignores a Request object's own headers the moment init.headers is
  // passed, so the wrapper has to start its merge from the Request. Losing
  // the Authorization header here would turn an authenticated call anonymous.
  it('a Request-object input keeps its own headers through the merge', async () => {
    currentId = 'req-xyz'
    const { base, calls } = recorder()
    const wrapped = createRequestIdFetch(base)
    await wrapped(
      new Request('https://db.test/rest/v1/orders', { headers: { authorization: 'Bearer t' } }),
    )
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('authorization')).toBe('Bearer t')
    expect(headers.get('x-request-id')).toBe('req-xyz')
  })
})
