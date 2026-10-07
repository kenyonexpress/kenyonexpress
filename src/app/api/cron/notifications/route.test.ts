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

/**
 * A minimal outbox: one row whose push leg is due and whose email leg already
 * went out. Records every `update` so the test can read what the drain wrote.
 */
function fakeOutbox(row: Record<string, unknown>) {
  const updates: Array<{ values: Record<string, unknown>; id: string }> = []
  const admin = {
    from: (_table: string) => ({
      select: () => ({
        or: () => ({
          order: () => ({
            limit: async () => ({ data: [row], error: null }),
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          updates.push({ values, id })
          return { error: null }
        },
      }),
    }),
  }
  return { admin, updates }
}

describe('quiet hours in the drain', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    sendEmail.mockReset()
    pushOutboxRow.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const ROW = {
    id: 'row-1',
    kind: 'order_shipped',
    recipient_email: 'a@b.test',
    payload: { order_id: 'o1' },
    dedupe_key: 'd1',
    attempts: 1,
    user_id: 'u1',
    status: 'sent',
    next_attempt_at: '2026-01-01T00:00:00.000Z',
    push_status: 'pending',
    push_attempts: 2,
    push_next_attempt_at: '2026-01-01T00:00:00.000Z',
  }

  it('moves a deferred push to its release time without spending an attempt', async () => {
    const { admin, updates } = fakeOutbox(ROW)
    createAdminClient.mockReturnValue(admin)
    pushOutboxRow.mockResolvedValue({
      outcome: 'deferred',
      until: '2026-01-16T06:00:00.000Z',
      reason: 'quiet hours 22:00-08:00 Asia/Jerusalem',
    })

    const response = await GET(request('Bearer s3cret'))
    const body = await response.json()

    expect(body).toMatchObject({ ok: true, considered: 1, pushDeferred: 1, pushFailed: 0 })
    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe('row-1')
    expect(updates[0]?.values).toEqual({
      push_status: 'pending',
      push_next_attempt_at: '2026-01-16T06:00:00.000Z',
      push_error: 'deferred: quiet hours 22:00-08:00 Asia/Jerusalem',
    })
    // The counter is the five transport retries. A quiet night is not one.
    expect(updates[0]?.values).not.toHaveProperty('push_attempts')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('still counts a real transport failure', async () => {
    const { admin, updates } = fakeOutbox(ROW)
    createAdminClient.mockReturnValue(admin)
    pushOutboxRow.mockResolvedValue({ outcome: 'retry', reason: 'expo: slow down' })

    const body = await (await GET(request('Bearer s3cret'))).json()

    expect(body).toMatchObject({ pushFailed: 1, pushDeferred: 0 })
    expect(updates[0]?.values).toMatchObject({ push_status: 'pending', push_attempts: 3 })
  })
})
