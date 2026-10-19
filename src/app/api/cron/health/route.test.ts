import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the health probe. Even a "read-only" checker must not run for
 * an anonymous caller: its output enumerates which internal services exist and
 * which are down, which is reconnaissance for free.
 */

const { runHealthChecks, checkSearchDrift, drainSearchOutbox } = vi.hoisted(() => ({
  runHealthChecks: vi.fn(),
  checkSearchDrift: vi.fn(),
  drainSearchOutbox: vi.fn(),
}))

vi.mock('@/lib/health/checks', () => ({
  runHealthChecks,
  buildHealthAlert: vi.fn(),
}))

vi.mock('@/lib/search/drift', () => ({ checkSearchDrift }))
vi.mock('@/lib/search/outbox-drain', () => ({ drainSearchOutbox }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

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
 * THE PRODUCER IS HONEST; THIS IS ABOUT THE CONSUMER.
 *
 * `checkSearchDrift` returns a distinct `skipped` status rather than `ok` when
 * Meilisearch is unconfigured, and `drift.test.ts` covers that thoroughly. What
 * was untested is whether this route SURFACES it. That is where the same class
 * of defect lived in `/api/ready`: `checkStorage` reported `ok` for a vendor it
 * had never contacted, and the caller repeated it.
 *
 * A drift check that reports `skipped` into a response that drops the field is
 * indistinguishable from one that found no drift.
 */
describe('the health response surfaces the search pipeline honestly', () => {
  beforeEach(() => {
    runHealthChecks.mockReset()
    checkSearchDrift.mockReset()
    drainSearchOutbox.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
    runHealthChecks.mockResolvedValue({ ok: true, checkedAt: '', dependencies: [] })
    drainSearchOutbox.mockResolvedValue({ claimed: 0, done: 0, failed: 0 })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('carries a skipped drift through to the body, rather than omitting it', async () => {
    checkSearchDrift.mockResolvedValue({ status: 'skipped', reason: 'meilisearch not configured' })
    const body = await (await GET(request('Bearer s3cret'))).json()
    expect(body.searchDrift).toEqual({
      status: 'skipped',
      reason: 'meilisearch not configured',
    })
  })

  it('never reports a skipped check as ok', async () => {
    checkSearchDrift.mockResolvedValue({ status: 'skipped', reason: 'meilisearch not configured' })
    const body = await (await GET(request('Bearer s3cret'))).json()
    expect(body.searchDrift.status).not.toBe('ok')
  })

  it('carries a real drift, with both counts and the gap', async () => {
    checkSearchDrift.mockResolvedValue({ status: 'drift', dbCount: 45, indexCount: 40, gap: -5 })
    const body = await (await GET(request('Bearer s3cret'))).json()
    expect(body.searchDrift).toEqual({ status: 'drift', dbCount: 45, indexCount: 40, gap: -5 })
  })

  it('does not let a skipped drift change the HTTP status', async () => {
    // The status code belongs to the dependency report. Meilisearch being
    // unprovisioned is a deployment that is not finished, not an outage, and a
    // 503 every five minutes for a known permanent condition is how a pager
    // gets ignored.
    checkSearchDrift.mockResolvedValue({ status: 'skipped', reason: 'meilisearch not configured' })
    expect((await GET(request('Bearer s3cret'))).status).toBe(200)
  })

  it('reports the outbox result too, so a stuck queue is visible', async () => {
    checkSearchDrift.mockResolvedValue({ status: 'skipped', reason: 'x' })
    drainSearchOutbox.mockResolvedValue({ claimed: 7, done: 5, failed: 2 })
    const body = await (await GET(request('Bearer s3cret'))).json()
    expect(body.searchOutbox).toEqual({ claimed: 7, done: 5, failed: 2 })
  })
})
