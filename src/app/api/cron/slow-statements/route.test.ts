import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The nightly slow-statement report: closed to strangers, 200 on a pending
 * migration, 500 only on a real read failure. The sampling rules live in
 * lib/observability/slow-statements.ts; this pins the route's contract.
 */

const { reportSlowStatements, createAdminClient } = vi.hoisted(() => ({
  reportSlowStatements: vi.fn(),
  createAdminClient: vi.fn(() => ({ rpc: vi.fn() })),
}))

vi.mock('@/lib/observability/slow-statements', () => ({ reportSlowStatements }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/slow-statements', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('slow-statements cron', () => {
  beforeEach(() => {
    reportSlowStatements.mockReset()
    createAdminClient.mockClear()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before building a client', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(reportSlowStatements).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(reportSlowStatements).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
  })

  it('answers 200 with the report, and echoes the request id', async () => {
    reportSlowStatements.mockResolvedValue({
      status: 'reported',
      thresholdMs: 300,
      count: 1,
      statements: [],
    })
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(await response.json()).toMatchObject({ ok: true, status: 'reported', count: 1 })
  })

  it('answers 200 on skipped: a pending migration 255 is a known state, not an incident', async () => {
    reportSlowStatements.mockResolvedValue({ status: 'skipped', reason: 'rpc_missing' })
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, status: 'skipped', reason: 'rpc_missing' })
  })

  it('answers 500 on a real read failure so the scheduler goes red', async () => {
    reportSlowStatements.mockResolvedValue({ status: 'failed', reason: 'permission denied' })
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ ok: false, status: 'failed' })
  })
})
