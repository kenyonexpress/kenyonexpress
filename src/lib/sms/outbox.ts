import 'server-only'

import type { PreferenceRow } from '@/lib/notifications/preferences'
import { mayNotify } from '@/lib/notifications/preferences'
import { log } from '@/lib/observability/log'
import { sendTransactionalSms } from '@/lib/sms/send'
import type { SmsKind } from '@/lib/sms/templates'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The SMS leg of the notification outbox.
 *
 * WHY THIS FILE EXISTS. `lib/sms` was complete and unreachable. Measured
 * 2026-09-10: `sendTransactionalSms` -- the only function in the repository
 * that sends an SMS -- had ZERO callers. Templates, segment budgets, the
 * Israeli-mobile check, the opt-out list, the status webhook and the per
 * message cost tracking were all built, all tested, and nothing ever invoked
 * any of it. A finished feature that cannot fire, which is the same shape the
 * notification centre was in a day earlier.
 *
 * WHAT RIDES WHERE. Like the WhatsApp leg, this has no status columns of its
 * own and does not try to own the outbox row's state machine. It piggybacks on
 * the email leg's `pending -> sent` transition, which the drain performs
 * exactly once per row, so a message cannot be sent twice without a schema
 * change this project is not allowed to apply. The cost is accepted and stated:
 * an email that succeeds while the SMS fails is not retried. For a paid channel
 * that is the right way round -- a duplicate SMS costs money and annoys, a
 * missing one is a message that arrived by mail instead.
 *
 * FOUR KINDS, AND `otp` IS NOT ONE OF THEM. The allowlist is a security
 * boundary and not a convenience:
 *
 *   - An OTP is never queued. It is sent directly, in the second the customer
 *     presses the button, by the phone-verification path. A code that arrives
 *     from a queue is a code that arrives late, and a queue that can carry one
 *     is a queue whose rows are worth stealing.
 *   - Operator kinds (`supplier_sale`, `low_stock`, `reconciliation_gap`,
 *     `invoice_dead`, `settlement_gap`) must never reach a customer's handset.
 *     They are refused twice, independently: they are not in this list, and
 *     they carry no `user_id`, so there is no phone number to send to either.
 *
 * THE PREFERENCE IT READS IS `whatsapp`, AND THAT IS DELIBERATE. There is no
 * `sms` channel: `notification_preferences_channel_check` accepts exactly
 * email, push, whatsapp and in_app (read from production 2026-09-10), so
 * adding a fifth switch to the settings page would make saving it fail with
 * 23514 until a migration lands. To the customer the handset is one channel
 * anyway -- somebody who turned "ההזמנה נשלחה" off for WhatsApp did not mean
 * "send it to the same phone as an SMS instead". When SMS gets its own column
 * this rule tightens; it never loosens.
 */

/** Outbox kinds that may become an SMS. */
export const SMS_OUTBOX_KINDS = [
  'voucher_issued',
  'voucher_expiring',
  'order_shipped',
  'refund_completed',
] as const

export type SmsOutboxKind = (typeof SMS_OUTBOX_KINDS)[number]

export function isSmsOutboxKind(kind: string): kind is SmsOutboxKind {
  return (SMS_OUTBOX_KINDS as readonly string[]).includes(kind)
}

/**
 * Best-effort SMS beside a just-sent email. Never throws and never touches the
 * outbox row; the caller's state machine is not this function's to move.
 * Returns what happened so the drain can count it.
 */
export async function sendOutboxSms(
  admin: SupabaseClient,
  row: { kind: string; user_id: string | null; payload: Record<string, unknown> | null },
  preferences: PreferenceRow[],
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    if (!isSmsOutboxKind(row.kind)) return 'skipped'
    // No account is no phone number. It is also every operator alert and every
    // guest order, neither of which has a handset we are entitled to text.
    if (!row.user_id) return 'skipped'
    if (!mayNotify(row.kind, 'whatsapp', preferences)) return 'skipped'

    const { data, error } = await admin
      .from('profiles')
      .select('phone')
      .eq('id', row.user_id)
      .maybeSingle()

    if (error) {
      // A phone we could not read is a message not sent, and it has to say so.
      // Reporting it as "no phone" would hide a database problem behind a
      // silent skip, which is how the whole module came to be unreachable.
      log.warn('sms.phone_lookup_failed', { kind: row.kind, reason: error.message })
      return 'failed'
    }

    const outcome = await sendTransactionalSms(admin, {
      kind: row.kind as SmsKind,
      payload: row.payload ?? {},
      phone: (data as { phone: string | null } | null)?.phone ?? null,
      userId: row.user_id,
    })

    if (outcome.outcome === 'sent') return 'sent'
    if (outcome.outcome === 'skipped') return 'skipped'
    log.warn('sms.outbox_send_failed', { kind: row.kind, reason: outcome.reason })
    return 'failed'
  } catch (err) {
    log.warn('sms.outbox_send_failed', {
      kind: row.kind,
      reason: err instanceof Error ? err.message : 'unknown',
    })
    return 'failed'
  }
}
