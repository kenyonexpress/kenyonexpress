import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the health probe. Even a "read-only" checker must not run for
 * an anonymous caller: its output enumerates which internal services exist and
 * which are down, which is reconnaissance for free.
 */

const { runHealthChecks } = vi.hoisted(() => ({ runHealthChecks: vi.fn() }))

vi.mock('@/lib/health/checks', () => ({
  runHealthChecks,
  buildHealthAlert: vi.fn(),
}))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/health', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('health cron auth', () => {
  beforeEach(() => {
    runHealthChecks.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before running any check', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(runHealthChecks).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(runHealthChecks).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(runHealthChecks).not.toHaveBeenCalled()
  })
})

/**
 * STEP 67: the cron is the ONE writer of the incident log. A correct secret
 * must run the checks and hand the report to `reconcileIncidents`, and the
 * JSON must carry the result, so a skipped table is visible in the response.
 */
const { reconcileIncidents } = vi.hoisted(() => ({ reconcileIncidents: vi.fn() }))

vi.mock('@/lib/health/incidents', () => ({ reconcileIncidents }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/search/outbox-drain', () => ({
  drainSearchOutbox: () => Promise.resolve({ claimed: 0, done: 0, failed: 0 }),
}))
vi.mock('@/lib/search/drift', () => ({
  checkSearchDrift: () => Promise.resolve({ status: 'skipped', reason: 'test' }),
}))
vi.mock('@/lib/observability/alert', () => ({ sendAlert: vi.fn(() => Promise.resolve(true)) }))

describe('health cron incident log', () => {
  beforeEach(() => {
    runHealthChecks.mockReset()
    reconcileIncidents.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reconciles incidents from the report and reports the outcome', async () => {
    const report = { ok: true, checkedAt: 'now', dependencies: [] }
    runHealthChecks.mockResolvedValue(report)
    reconcileIncidents.mockResolvedValue({ opened: [], resolved: [], skipped: 'schema_absent' })

    const response = await GET(request('Bearer s3cret'))

    expect(response.status).toBe(200)
    expect(reconcileIncidents).toHaveBeenCalledWith({}, report)
    const body = (await response.json()) as { incidents: unknown }
    expect(body.incidents).toEqual({ opened: [], resolved: [], skipped: 'schema_absent' })
  })
})
