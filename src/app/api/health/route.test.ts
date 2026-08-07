import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Goal 10. The contract a pager depends on, and the one an attacker must not
 * get anything from.
 */

const select = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select }) }),
}))

const { GET } = await import('./route')

/**
 * The handler is wrapped by `withRequestLog`, so it takes the request it always
 * took in production; only these tests were calling it with none.
 */
const probe = () => new Request('http://localhost/api/health') as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  select.mockResolvedValue({ error: null })
})

describe('/api/health', () => {
  it('answers 200 when the database is reachable', async () => {
    const res = await GET(probe())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, database: 'ok' })
  })

  it('answers 503, not 200-with-a-flag, when the database errors', async () => {
    select.mockResolvedValue({ error: { message: 'connection refused' } })

    const res = await GET(probe())

    // A monitor that reads only the status line still has to page.
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ ok: false, database: 'down' })
  })

  it('answers 503 when the client throws rather than returning an error', async () => {
    select.mockRejectedValue(new Error('boom'))

    const res = await GET(probe())

    expect(res.status).toBe(503)
  })

  it('leaks no version, env name or database error text', async () => {
    select.mockResolvedValue({ error: { message: 'FATAL: password authentication failed' } })

    const body = JSON.stringify(await (await GET(probe())).json())

    expect(body).not.toContain('password')
    expect(body).not.toContain('FATAL')
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(['database', 'latency_ms', 'ok'])
  })

  it('is never cached', async () => {
    const res = await GET(probe())

    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('carries the request id a pager can quote back', async () => {
    const request = new Request('http://localhost/api/health', {
      headers: { 'x-request-id': 'uptime-probe-1' },
    }) as NextRequest

    const res = await GET(request)

    expect(res.headers.get('x-request-id')).toBe('uptime-probe-1')
  })

  it('reads no rows back', async () => {
    await GET(probe())

    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  })
})
