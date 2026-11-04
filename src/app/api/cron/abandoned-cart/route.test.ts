import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the abandoned-cart mailer. The static scan in
 * src/lib/auth/cron-auth.test.ts proves the source calls bearerMatches; this
 * proves the behaviour: a bad caller gets 401 and the route touches neither
 * the database nor the mailer.
 */

const { createAdminClient, sendEmail } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/growth/resend', () => ({ sendEmail }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/abandoned-cart', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('abandoned-cart cron auth', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    sendEmail.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching anything', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
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

describe('abandoned-cart cron under the S12 automatic-email policy', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    sendEmail.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends nothing for an authorised run, and says why', async () => {
    // The purchase confirmation is the only automatic customer mail. The
    // real policy module is used here, not a mock: this is the test that
    // fails if somebody switches the nudge back on.
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      disabled: 'automatic_email_policy',
      sent: 0,
    })
    // `createAdminClient` is reached by `withJobRun`'s bookkeeping, not by the
    // route: the mock returns undefined, so any route read would have thrown.
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
