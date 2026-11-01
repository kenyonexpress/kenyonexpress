import type { PreferenceRow } from '@/lib/notifications/preferences'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The leg that turns a queued notification into an SMS.
 *
 * The module under test is the answer to a measurement rather than a feature
 * request: on 2026-09-10 `sendTransactionalSms` had zero callers, so every
 * template, budget and opt-out check in `lib/sms` was unreachable. What these
 * cases hold is the boundary, because the failures are asymmetric. A message
 * that does not go out is a message the customer gets by email instead. A
 * message that goes to the wrong handset, or twice, costs money and cannot be
 * taken back -- and one carrying an operator alert to a shopper is a private
 * figure published to a stranger.
 */

const sendTransactionalSms = vi.fn()
vi.mock('@/lib/sms/send', () => ({
  sendTransactionalSms: (...args: unknown[]) => sendTransactionalSms(...args),
}))

const { isSmsOutboxKind, sendOutboxSms, SMS_OUTBOX_KINDS } = await import('@/lib/sms/outbox')

/** A Supabase double narrow enough that a changed read fails loudly. */
function admin(phone: string | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: phone === null ? null : { phone }, error }),
        }),
      }),
    }),
  } as never
}

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  kind: 'voucher_issued',
  user_id: 'user-1',
  payload: { vouchers: [{ code: 'ABC12345', product_name: 'עיסוי' }] },
  ...over,
})

beforeEach(() => {
  sendTransactionalSms.mockReset().mockResolvedValue({ outcome: 'sent', sid: 'SM1', segments: 1 })
})

describe('which kinds may become an SMS', () => {
  it('is the four the business asked for', () => {
    expect([...SMS_OUTBOX_KINDS]).toEqual([
      'voucher_issued',
      'voucher_expiring',
      'order_shipped',
      'refund_completed',
    ])
  })

  it('refuses otp, which is never queued', async () => {
    // An OTP is sent in the second the customer presses the button. A code
    // that arrives from a queue is a code that arrives late, and a queue that
    // can carry one is a queue whose rows are worth stealing.
    expect(isSmsOutboxKind('otp')).toBe(false)
    expect(await sendOutboxSms(admin('0521234567'), row({ kind: 'otp' }), [])).toBe('skipped')
    expect(sendTransactionalSms).not.toHaveBeenCalled()
  })

  it('refuses an operator kind twice over', async () => {
    // Not in the allowlist, AND carrying no user_id. Two independent refusals
    // of the same fact, because a supplier's commission or a reconciliation
    // gap on a shopper's phone is a private figure published to a stranger.
    for (const kind of ['supplier_sale', 'low_stock', 'reconciliation_gap', 'invoice_dead']) {
      expect(isSmsOutboxKind(kind)).toBe(false)
      expect(await sendOutboxSms(admin('0521234567'), row({ kind, user_id: null }), [])).toBe(
        'skipped',
      )
    }
    expect(sendTransactionalSms).not.toHaveBeenCalled()
  })
})

describe('who it will text', () => {
  it('sends for an allowlisted kind with an account and a phone', async () => {
    expect(await sendOutboxSms(admin('0521234567'), row(), [])).toBe('sent')
    expect(sendTransactionalSms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'voucher_issued', phone: '0521234567', userId: 'user-1' }),
    )
  })

  it('says nothing to a row with no account', async () => {
    // A guest order and an operator alert look identical here, and neither has
    // a handset we are entitled to text.
    expect(await sendOutboxSms(admin('0521234567'), row({ user_id: null }), [])).toBe('skipped')
    expect(sendTransactionalSms).not.toHaveBeenCalled()
  })

  it('obeys the switch the customer actually has', async () => {
    // There is no `sms` channel: the live CHECK on notification_preferences
    // accepts email, push, whatsapp and in_app. To the customer the handset is
    // one channel, so turning a kind off for WhatsApp turns it off here too.
    const off: PreferenceRow[] = [{ kind: 'order_shipped', channel: 'whatsapp', enabled: false }]
    expect(await sendOutboxSms(admin('0521234567'), row({ kind: 'order_shipped' }), off)).toBe(
      'skipped',
    )
    expect(sendTransactionalSms).not.toHaveBeenCalled()
  })

  it('cannot be switched off for a kind that is not optional', async () => {
    // `voucher_issued` is the thing that was bought. `mayNotify` refuses to
    // read a stored preference for a required kind at all, so a row saying
    // otherwise changes nothing.
    const off: PreferenceRow[] = [{ kind: 'voucher_issued', channel: 'whatsapp', enabled: false }]
    expect(await sendOutboxSms(admin('0521234567'), row(), off)).toBe('sent')
  })
})

describe('when something is wrong', () => {
  it('reports a phone lookup that failed rather than calling it "no phone"', async () => {
    // The distinction is the reason this module exists: a silent skip is how a
    // whole delivery channel went unnoticed for a month.
    expect(await sendOutboxSms(admin(null, { message: 'boom' }), row(), [])).toBe('failed')
    expect(sendTransactionalSms).not.toHaveBeenCalled()
  })

  it('never throws at the drain', async () => {
    sendTransactionalSms.mockRejectedValue(new Error('twilio is down'))
    expect(await sendOutboxSms(admin('0521234567'), row(), [])).toBe('failed')
  })

  it('passes a skip through as a skip', async () => {
    // The flag being off, a landline, or a number that sent STOP. None of them
    // is a failure of this row and none should be counted as one.
    sendTransactionalSms.mockResolvedValue({ outcome: 'skipped', reason: 'SMS is switched off' })
    expect(await sendOutboxSms(admin('0521234567'), row(), [])).toBe('skipped')
  })
})
