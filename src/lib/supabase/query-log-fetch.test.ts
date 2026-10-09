import { createQueryLogFetch, slowQueryMs, supabaseTarget } from '@/lib/supabase/query-log-fetch'
import { SupabaseTimeoutError } from '@/lib/supabase/timeout-fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// What this file tests is the wrapper's decision to log which event at which
// level, not the logger's transport -- same line rls-report-fetch.test.ts draws.
const logged: Array<{ level: string; event: string; fields: Record<string, unknown> }> = []
vi.mock('@/lib/observability/log', () => {
  const record = (level: string) => (event: string, fields: Record<string, unknown>) =>
    logged.push({ level, event, fields })
  return {
    log: {
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
    },
  }
})

const REST = 'https://x.supabase.co/rest/v1/orders?select=*&email=eq.pii@example.com'

// This repo's ProcessEnv type requires NODE_ENV; an empty override is the point here.
const NO_ENV = {} as unknown as NodeJS.ProcessEnv

function baseReturning(status: number) {
  return (() => Promise.resolve(new Response('{}', { status }))) as typeof fetch
}

describe('supabaseTarget', () => {
  it('names tables, rpcs and auth endpoints, and nothing else', () => {
    expect(supabaseTarget(REST)).toBe('orders')
    expect(supabaseTarget('https://x.supabase.co/rest/v1/rpc/close_order')).toBe('rpc:close_order')
    expect(supabaseTarget('https://x.supabase.co/auth/v1/token?grant_type=password')).toBe(
      'auth:token',
    )
    expect(supabaseTarget('https://x.supabase.co/storage/v1/object/img.png')).toBeNull()
    expect(supabaseTarget('not a url')).toBeNull()
  })
})

describe('slowQueryMs', () => {
  it('defaults to 1500 and accepts only a positive integer override', () => {
    expect(slowQueryMs(NO_ENV)).toBe(1500)
    expect(slowQueryMs({ SUPABASE_SLOW_QUERY_MS: '400' } as unknown as NodeJS.ProcessEnv)).toBe(400)
    expect(slowQueryMs({ SUPABASE_SLOW_QUERY_MS: 'soon' } as unknown as NodeJS.ProcessEnv)).toBe(
      1500,
    )
    expect(slowQueryMs({ SUPABASE_SLOW_QUERY_MS: '-1' } as unknown as NodeJS.ProcessEnv)).toBe(1500)
  })
})

describe('createQueryLogFetch', () => {
  beforeEach(() => {
    logged.length = 0
  })

  it('logs a fast success as db.query at debug, without the query string', async () => {
    const wrapped = createQueryLogFetch(baseReturning(200), NO_ENV)
    const response = await wrapped(REST)
    expect(response.status).toBe(200)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({
      level: 'debug',
      event: 'db.query',
      fields: { target: 'orders', method: 'GET', status: 200 },
    })
    expect(JSON.stringify(logged[0])).not.toContain('pii@example.com')
  })

  it('keeps a 4xx at debug: PostgREST answers 406 for a .single() miss', async () => {
    const wrapped = createQueryLogFetch(baseReturning(406), NO_ENV)
    await wrapped(REST)
    expect(logged[0]).toMatchObject({ level: 'debug', event: 'db.query' })
  })

  it('logs a slow success as db.query_slow at warn', async () => {
    const slow = (async () => {
      await new Promise((r) => setTimeout(r, 12))
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    const wrapped = createQueryLogFetch(slow, {
      SUPABASE_SLOW_QUERY_MS: '5',
    } as unknown as NodeJS.ProcessEnv)
    await wrapped(REST, { method: 'POST' })
    expect(logged[0]).toMatchObject({
      level: 'warn',
      event: 'db.query_slow',
      fields: { target: 'orders', method: 'POST', status: 200, threshold_ms: 5 },
    })
  })

  it('logs a 5xx as db.query_failed at error and still returns the response', async () => {
    const wrapped = createQueryLogFetch(baseReturning(503), NO_ENV)
    const response = await wrapped(REST)
    expect(response.status).toBe(503)
    expect(logged[0]).toMatchObject({ level: 'error', event: 'db.query_failed' })
  })

  it('logs a throw as db.query_failed and rethrows it untouched', async () => {
    const boom = new Error('ECONNRESET')
    const wrapped = createQueryLogFetch((() => Promise.reject(boom)) as typeof fetch, NO_ENV)
    await expect(wrapped(REST)).rejects.toBe(boom)
    expect(logged[0]).toMatchObject({ level: 'error', event: 'db.query_failed' })
    expect(logged[0]?.fields.err).toBe(boom)
  })

  it('stays silent on a SupabaseTimeoutError: supabase.timeout already logged it', async () => {
    const timeout = new SupabaseTimeoutError(10_000)
    const wrapped = createQueryLogFetch((() => Promise.reject(timeout)) as typeof fetch, NO_ENV)
    await expect(wrapped(REST)).rejects.toBe(timeout)
    expect(logged).toHaveLength(0)
  })

  it('passes unrecognized urls through without logging', async () => {
    const wrapped = createQueryLogFetch(baseReturning(500), NO_ENV)
    await wrapped('https://x.supabase.co/storage/v1/object/img.png')
    expect(logged).toHaveLength(0)
  })
})
