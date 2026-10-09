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
