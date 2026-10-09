import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the low-stock alerter. It reads the catalogue with admin
 * credentials and mails the admin; both stay unreachable for a bad caller.
 */

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/stock', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('stock cron auth', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching the database', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
