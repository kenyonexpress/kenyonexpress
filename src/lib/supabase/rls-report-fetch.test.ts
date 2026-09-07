import { createRlsReportFetch } from '@/lib/supabase/rls-report-fetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The scope is recorded rather than asserted through the real SDK: what this
// file tests is the wrapper's decision to report, not Sentry's transport.
const captured: Array<{ message: string; tags: Record<string, string> }> = []
vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => void) => {
    const tags: Record<string, string> = {}
    const scope = {
      setTag: (k: string, v: string) => {
        tags[k] = v
      },
      setFingerprint: () => {},
      setContext: () => {},
      captureMessage: () => {},
    }
    fn(scope)
    captured.push({ message: lastMessage, tags })
  },
  captureMessage: (message: string) => {
    lastMessage = message
  },
}))
let lastMessage = ''

const logged: Array<Record<string, unknown>> = []
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (_event: string, fields: Record<string, unknown>) => {
      logged.push(fields)
    },
  },
}))

function baseReturning(status: number, body: unknown) {
  const base = (() =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )) as typeof fetch
  return base
}

const RLS_BODY = {
  code: '42501',
  message: 'new row violates row-level security policy for table "orders"',
}

describe('createRlsReportFetch', () => {
  beforeEach(() => {
    captured.length = 0
    logged.length = 0
    vi.stubEnv('SENTRY_DSN', 'https://key@o1.ingest.de.sentry.io/1')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports a 403 with code 42501 and returns the response readable', async () => {
    const wrapped = createRlsReportFetch(baseReturning(403, RLS_BODY))
    const res = await wrapped('https://db.test/rest/v1/orders?select=*', { method: 'POST' })
    expect(res.status).toBe(403)
    // The clone must not have consumed the caller's body.
    expect(await res.json()).toEqual(RLS_BODY)
    expect(captured).toHaveLength(1)
    expect(captured[0]?.message).toBe('RLS denied: POST orders')
    expect(captured[0]?.tags).toMatchObject({ area: 'rls', rls_target: 'orders' })
    expect(logged[0]).toMatchObject({ target: 'orders', method: 'POST', status: 403 })
  })

  it('names an RPC target as rpc:<function>', async () => {
    const wrapped = createRlsReportFetch(baseReturning(400, { code: '42501', message: 'denied' }))
    await wrapped('https://db.test/rest/v1/rpc/close_order', { method: 'POST' })
    expect(captured[0]?.tags.rls_target).toBe('rpc:close_order')
  })

  it('matches on the message when the code is absent', async () => {
    const wrapped = createRlsReportFetch(
      baseReturning(403, { message: 'violates row-level security policy' }),
    )
    await wrapped('https://db.test/rest/v1/vouchers')
    expect(captured).toHaveLength(1)
  })

  it('stays silent on a non-RLS PostgREST error', async () => {
    const wrapped = createRlsReportFetch(
      baseReturning(400, { code: 'PGRST100', message: 'failed to parse filter' }),
    )
    await wrapped('https://db.test/rest/v1/orders')
    expect(captured).toHaveLength(0)
    expect(logged).toHaveLength(0)
  })

  it('stays silent on success, on auth endpoints, and on server errors', async () => {
    for (const [status, url, body] of [
      [200, 'https://db.test/rest/v1/orders', {}],
      [403, 'https://db.test/auth/v1/token', RLS_BODY],
      [500, 'https://db.test/rest/v1/orders', RLS_BODY],
    ] as const) {
      const wrapped = createRlsReportFetch(baseReturning(status, body))
      await wrapped(url)
    }
    expect(captured).toHaveLength(0)
  })

  it('never throws on an unparseable body', async () => {
    const wrapped = createRlsReportFetch(baseReturning(403, 'permission denied'))
    const res = await wrapped('https://db.test/rest/v1/orders')
    expect(res.status).toBe(403)
    expect(captured).toHaveLength(0)
  })

  it('logs but does not capture without a DSN', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const wrapped = createRlsReportFetch(baseReturning(403, RLS_BODY))
    await wrapped('https://db.test/rest/v1/orders')
    expect(logged).toHaveLength(1)
    expect(captured).toHaveLength(0)
  })
})
