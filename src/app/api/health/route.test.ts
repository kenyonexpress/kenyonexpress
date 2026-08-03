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

beforeEach(() => {
  vi.clearAllMocks()
  select.mockResolvedValue({ error: null })
})

describe('/api/health', () => {
  it('answers 200 when the database is reachable', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, database: 'ok' })
  })

  it('answers 503, not 200-with-a-flag, when the database errors', async () => {
    select.mockResolvedValue({ error: { message: 'connection refused' } })

    const res = await GET()

    // A monitor that reads only the status line still has to page.
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ ok: false, database: 'down' })
  })

  it('answers 503 when the client throws rather than returning an error', async () => {
    select.mockRejectedValue(new Error('boom'))

    const res = await GET()

    expect(res.status).toBe(503)
  })

  it('leaks no version, env name or database error text', async () => {
    select.mockResolvedValue({ error: { message: 'FATAL: password authentication failed' } })

    const body = JSON.stringify(await (await GET()).json())

    expect(body).not.toContain('password')
    expect(body).not.toContain('FATAL')
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(['database', 'latency_ms', 'ok'])
  })

  it('is never cached', async () => {
    const res = await GET()

    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('reads no rows back', async () => {
    await GET()

    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  })
})
