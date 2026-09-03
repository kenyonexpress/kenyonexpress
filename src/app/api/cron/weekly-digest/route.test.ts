import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the weekly digest. Its body is a revenue summary; an
 * anonymous caller must trigger neither the query nor the mail.
 */

const { createAdminClient, sendEmail, loadSalesLines } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
  loadSalesLines: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/growth/resend', () => ({ sendEmail }))
vi.mock('@/server/analytics/queries', () => ({ loadSalesLines }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/weekly-digest', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('weekly-digest cron auth', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    sendEmail.mockReset()
    loadSalesLines.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching anything', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(loadSalesLines).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
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
