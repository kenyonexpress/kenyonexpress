import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The email leg reads the customer's preferences before it sends. Until C177
 * nothing on this leg read them, so "קבל הכל באפליקציה" was saved and ignored.
 */

const { createAdminClient, sendEmail, pushOutboxRow, sendOutboxWhatsapp } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
  pushOutboxRow: vi.fn(),
  sendOutboxWhatsapp: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/push/dispatch', () => ({ pushOutboxRow }))
vi.mock('@/lib/whatsapp/outbox', () => ({ sendOutboxWhatsapp }))

import { GET } from './route'

const PAST = '2000-01-01T00:00:00.000Z'

function outboxRow(kind: string) {
  return {
    id: 'row-1',
    kind,
    recipient_email: 'customer@example.test',
    payload: { days_remaining: 3, product_name: 'שובר', code: 'ABC' },
    dedupe_key: `${kind}:1`,
    attempts: 0,
    user_id: 'user-1',
    status: 'pending',
    next_attempt_at: PAST,
    push_status: 'sent',
    push_attempts: 1,
    push_next_attempt_at: PAST,
  }
}

function fakeAdmin(row: ReturnType<typeof outboxRow>, prefs: unknown[]) {
  const updates: Record<string, unknown>[] = []
  const admin = {
    from(table: string) {
      if (table === 'notification_preferences') {
        return { select: () => ({ eq: async () => ({ data: prefs, error: null }) }) }
      }
      return {
        select: () => ({
          or: () => ({ order: () => ({ limit: async () => ({ data: [row], error: null }) }) }),
        }),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch)
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }
  return { admin, updates }
}

const ALL_IN_APP = [{ kind: 'all', channel: 'in_app', enabled: true }]

function run() {
  return GET(
    new NextRequest('https://example.test/api/cron/notifications', {
      headers: { authorization: 'Bearer s3cret' },
    }),
  )
}

describe('notifications drain honours "everything in the app only"', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    for (const fn of [createAdminClient, sendEmail, pushOutboxRow, sendOutboxWhatsapp]) {
      fn.mockReset()
    }
    sendEmail.mockResolvedValue({ ok: true })
    sendOutboxWhatsapp.mockResolvedValue('skipped')
  })

  it('does not mail an optional kind and settles the row as suppressed', async () => {
    const { admin, updates } = fakeAdmin(outboxRow('voucher_expiring'), ALL_IN_APP)
    createAdminClient.mockReturnValue(admin)

    const body = await (await run()).json()

    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendOutboxWhatsapp).not.toHaveBeenCalled()
    expect(body.suppressed).toBe(1)
    expect(updates).toEqual([
      { status: 'dead', last_error: 'suppressed: customer notification preference' },
    ])
  })

  it('still mails what was bought, and hands the rows to WhatsApp', async () => {
    const { admin } = fakeAdmin(outboxRow('voucher_issued'), ALL_IN_APP)
    createAdminClient.mockReturnValue(admin)

    const body = await (await run()).json()

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(body.suppressed).toBe(0)
    expect(sendOutboxWhatsapp.mock.calls[0]?.[2]).toEqual(ALL_IN_APP)
  })

  it('mails an optional kind when the customer has no opinion', async () => {
    const { admin } = fakeAdmin(outboxRow('voucher_expiring'), [])
    createAdminClient.mockReturnValue(admin)

    await run()

    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
})
