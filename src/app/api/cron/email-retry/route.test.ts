import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The email queue's second chance. What the route owns: the gate (an
 * anonymous caller must not be able to flush dead rows back into the queue),
 * the shape of the answer, and 500 on a failure so the scheduler retries.
 */

const { resurrectDeadEmails } = vi.hoisted(() => ({ resurrectDeadEmails: vi.fn() }))

vi.mock('@/lib/email/outbox-retry', () => ({ resurrectDeadEmails }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/email-retry', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('email-retry cron', () => {
  beforeEach(() => {
    resurrectDeadEmails.mockReset().mockResolvedValue({ scanned: 3, requeued: 2, permanent: 1 })
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching the queue', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(resurrectDeadEmails).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(resurrectDeadEmails).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(resurrectDeadEmails).not.toHaveBeenCalled()
  })

  it('reports what it requeued and what it left for the operator', async () => {
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, scanned: 3, requeued: 2, permanent: 1 })
  })

  it('answers 500 with the reason when the queue cannot be read or written', async () => {
    resurrectDeadEmails.mockRejectedValue(new Error('dead outbox read failed: boom'))
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, error: 'dead outbox read failed: boom' })
  })
})
