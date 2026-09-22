import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the outbox drainer. Draining on an attacker's schedule could
 * flush retries early and burn the mail quota, so a bad caller gets 401 before
 * the outbox is read.
 */

const { createAdminClient, sendEmail, pushOutboxRow, sendOutboxWhatsapp, sendOutboxSms } =
  vi.hoisted(() => ({
    createAdminClient: vi.fn(),
    sendEmail: vi.fn(),
    pushOutboxRow: vi.fn(),
    sendOutboxWhatsapp: vi.fn(),
    sendOutboxSms: vi.fn(),
  }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/email/resend', () => ({ sendEmail }))
vi.mock('@/lib/push/dispatch', () => ({ pushOutboxRow }))
vi.mock('@/lib/whatsapp/outbox', () => ({ sendOutboxWhatsapp }))
vi.mock('@/lib/sms/outbox', () => ({ sendOutboxSms }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/notifications', {
    headers: auth ? { authorization: auth } : {},
  })
}

/**
 * A minimal fake of the one client method this route calls on
 * `notification_outbox`: a select chain resolving to `rows`, and an update
 * chain that records what was written without touching a database. Every row
 * used with this fixture has `user_id: null`, so `loadPreferenceRows` returns
 * `[]` without an admin call and the in-app leg (`row.user_id && ...`) never
 * fires -- neither needs its own table mock for these tests, which are about
 * the email/WhatsApp/SMS fan-out, not the fourth leg.
 */
function fakeAdmin(rows: Record<string, unknown>[]) {
  const updates: { patch: Record<string, unknown>; id: string }[] = []
  const admin = {
    from(table: string) {
      if (table !== 'notification_outbox') {
        throw new Error(`unexpected table in this fixture: ${table}`)
      }
      return {
        select: () => ({
          or: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            updates.push({ patch, id })
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  }
  return { admin, updates }
}

const BASE_ROW = {
  id: 'row-1',
  recipient_email: 'customer@example.test',
  payload: {},
  dedupe_key: 'dedupe-1',
  attempts: 0,
  user_id: null,
  status: 'pending',
  next_attempt_at: '2020-01-01T00:00:00.000Z',
  // Not due: keeps the push leg (unmocked here) out of the loop entirely.
  push_status: 'sent',
  push_next_attempt_at: '2099-01-01T00:00:00.000Z',
  push_attempts: 0,
}

describe('notifications cron auth', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    sendEmail.mockReset()
    pushOutboxRow.mockReset()
    sendOutboxWhatsapp.mockReset()
    sendOutboxSms.mockReset()
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
 * The owner's 22.09.2026 policy ("no customer email except password reset")
 * makes `mayNotify` refuse the email channel for `voucher_issued`. Before this
 * fan-out was moved, that refusal alone would have also killed WhatsApp/SMS
 * delivery of the voucher code, because both rode inside the `sendEmail`
 * success branch. These tests are the regression guard for that fix.
 */
describe('WhatsApp/SMS fan-out survives the email being blocked by policy', () => {
  beforeEach(() => {
    sendEmail.mockReset()
    pushOutboxRow.mockReset()
    sendOutboxWhatsapp.mockReset()
    sendOutboxSms.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('marks a policy-blocked customer kind skipped, but still fans out WhatsApp and SMS', async () => {
    const row = { ...BASE_ROW, kind: 'voucher_issued' }
    const { admin, updates } = fakeAdmin([row])
    createAdminClient.mockReturnValue(admin)
    sendOutboxWhatsapp.mockResolvedValue('sent')
    sendOutboxSms.mockResolvedValue('sent')

    const body = await (await GET(request('Bearer s3cret'))).json()

    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendOutboxWhatsapp).toHaveBeenCalledTimes(1)
    expect(sendOutboxSms).toHaveBeenCalledTimes(1)
    expect(updates).toEqual([
      {
        id: 'row-1',
        patch: { status: 'skipped', last_error: 'email switched off by the customer' },
      },
    ])
    expect(body).toMatchObject({ skipped: 1, sent: 0, whatsapped: 1, smsSent: 1 })
  })

  it('still sends the email for an operator kind, unaffected by the customer policy', async () => {
    const row = {
      ...BASE_ROW,
      kind: 'low_stock',
      payload: { product_id: 'p1', product_name: 'מוצר', available: 0, stock_quantity: 0 },
    }
    const { admin } = fakeAdmin([row])
    createAdminClient.mockReturnValue(admin)
    sendEmail.mockResolvedValue({ ok: true })

    const body = await (await GET(request('Bearer s3cret'))).json()

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendOutboxWhatsapp).toHaveBeenCalledTimes(1)
    expect(sendOutboxSms).toHaveBeenCalledTimes(1)
    expect(body).toMatchObject({ sent: 1, skipped: 0 })
  })

  it('does not unlock WhatsApp/SMS on a genuine provider failure', async () => {
    const row = {
      ...BASE_ROW,
      kind: 'low_stock',
      payload: { product_id: 'p1', product_name: 'מוצר', available: 0, stock_quantity: 0 },
    }
    const { admin } = fakeAdmin([row])
    createAdminClient.mockReturnValue(admin)
    sendEmail.mockResolvedValue({ ok: false, skipped: false, reason: 'resend down' })

    const body = await (await GET(request('Bearer s3cret'))).json()

    expect(sendOutboxWhatsapp).not.toHaveBeenCalled()
    expect(sendOutboxSms).not.toHaveBeenCalled()
    expect(body).toMatchObject({ failed: 1, sent: 0, skipped: 0 })
  })
})
