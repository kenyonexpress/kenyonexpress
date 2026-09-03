import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the outbox drainer. Draining on an attacker's schedule could
 * flush retries early and burn the mail quota, so a bad caller gets 401 before
 * the outbox is read.
 */

const { createAdminClient, sendEmail, pushOutboxRow } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
  pushOutboxRow: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/push/dispatch', () => ({ pushOutboxRow }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/notifications', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('notifications cron auth', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    sendEmail.mockReset()
    pushOutboxRow.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching anything', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(pushOutboxRow).not.toHaveBeenCalled()
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
