import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The payment journal, which existed as a table and as nothing else.
 *
 * `payment_events` went live with migration 130 and a 38-value enum. Measured
 * against production on 2026-09-01: the table is there, the enum is there, it
 * holds ZERO rows, and the whole repository contained exactly one occurrence of
 * the string `payment_events` -- the filename, in a migration-inventory test.
 * Nothing had ever been wired to write to it.
 *
 * That is worse than not having the table. The money path already reports to
 * Sentry through `capturePaymentAlarm`, so a failure raises an alarm; what was
 * missing is the ordered record of what happened before it, which is the thing
 * you need at 3am to tell a replay from a double charge.
 *
 * WHY THIS NEVER THROWS. Same rule as `writeAuditLog`: the journal is an
 * observer of the money path and must never become a way for it to fail. A
 * customer whose card was charged must not see an error because the row
 * describing the charge could not be written. Every failure is logged and
 * swallowed.
 *
 * WHY THE CLIENT IS PASSED STRUCTURALLY. `src/types/database.ts` predates 130
 * and does not know `payment_events` exists, so `admin.from('payment_events')`
 * does not typecheck against the generated types. Regenerating them is a
 * separate change to a very large generated file. The narrow structural type
 * below is the same dodge `markOrderItemRedeemed` uses, for the same reason,
 * and it is deliberately visible rather than hidden behind an `as any` at the
 * call site.
 */

/**
 * The 38 members of `public.payment_event_type`, in the order the migration
 * declares them.
 *
 * `payment-events.test.ts` parses `130_payment_events.sql` and fails if this
 * list and that enum ever differ. Writing a value the enum does not carry is a
 * 22P02 at runtime, on the money path, which is exactly where an avoidable
 * runtime error is least welcome.
 */
export const PAYMENT_EVENT_TYPES = [
  // opening
  'checkout_started',
  'order_created',
  'stock_reserved',
  'stock_reservation_failed',
  // hosted page
  'low_profile_requested',
  'low_profile_created',
  'low_profile_failed',
  'redirected',
  // saved-card path; there is no webhook for this at all
  'token_charge_requested',
  'token_charge_succeeded',
  'token_charge_declined',
  // callback
  'callback_received',
  'callback_replay',
  'callback_rejected',
  'callback_unknown_payment',
  'callback_provider_failure',
  // server-to-server verification: OUR finding, not the provider's statement
  'verify_requested',
  'verify_succeeded',
  'verify_failed',
  'verify_contradicted_callback',
  'amount_mismatch',
  'amount_unreadable',
  // closing the order
  'finalize_started',
  'finalize_succeeded',
  'finalize_replay',
  'finalize_failed',
  'voucher_issued',
  'voucher_issue_refused',
  // money going back out
  'refund_requested',
  'refund_succeeded',
  'refund_failed',
  'cancellation_fee_applied',
  'wallet_credited',
  // out-of-band findings
  'dlq_replay_started',
  'reconciliation_matched',
  'reconciliation_missing_locally',
  'reconciliation_missing_remotely',
  'reconciliation_amount_differs',
] as const

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number]

export interface PaymentEvent {
  eventType: PaymentEventType
  /**
   * The same token `capturePaymentAlarm` tags Sentry with, so an alarm and the
   * row that caused it can be joined. `cardcom_webhook_finalize`, and so on.
   */
  stage?: string | null
  paymentId?: string | null
  orderId?: string | null
  lowProfileId?: string | null
  transactionId?: string | null
  /**
   * The provider's own id for this event where it has one. The table carries a
   * unique index on it, which is what makes a replayed webhook detectable as a
   * replay rather than as a second payment.
   */
  externalEventId?: string | null
  amountAgorot?: number | null
  detail?: Record<string, unknown>
  actorId?: string | null
  actorRole?: string | null
}

/** The single row shape written, kept next to the insert that uses it. */
type PaymentEventRow = {
  event_type: string
  stage: string | null
  payment_id: string | null
  order_id: string | null
  low_profile_id: string | null
  transaction_id: string | null
  external_event_id: string | null
  amount_agorot: number | null
  detail: Record<string, unknown>
  actor_id: string | null
  actor_role: string | null
  environment: string | null
}

/**
 * Minimal structural shape of the service-role client. See the note above on
 * why this is not the generated `SupabaseClient<Database>`.
 */
export type PaymentEventAdmin = {
  from: (table: 'payment_events') => {
    insert: (row: PaymentEventRow) => Promise<{ error: { message: string } | null }>
  }
}

/**
 * `amount_agorot` is `bigint` and money is integer agorot by project rule, so a
 * non-integer here is a bug upstream rather than something to round quietly.
 * It is dropped to null and logged: a journal row that is missing an amount is
 * worth more than no journal row, and silently storing a rounded number would
 * make the journal disagree with the payment it describes.
 */
function safeAmount(value: number | null | undefined, eventType: string): number | null {
  if (value == null) return null
  if (!Number.isInteger(value)) {
    log.error('payment_events.amount_not_integer', { eventType, value })
    return null
  }
  return value
}

/** Best effort by design. Records one event; never throws, never rejects. */
export async function recordPaymentEvent(
  event: PaymentEvent,
  admin?: PaymentEventAdmin,
): Promise<void> {
  try {
    const client = admin ?? (createAdminClient() as unknown as PaymentEventAdmin)
    const { error } = await client.from('payment_events').insert({
      event_type: event.eventType,
      stage: event.stage ?? null,
      payment_id: event.paymentId ?? null,
      order_id: event.orderId ?? null,
      low_profile_id: event.lowProfileId ?? null,
      transaction_id: event.transactionId ?? null,
      external_event_id: event.externalEventId ?? null,
      amount_agorot: safeAmount(event.amountAgorot, event.eventType),
      detail: event.detail ?? {},
      actor_id: event.actorId ?? null,
      actor_role: event.actorRole ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    })
    if (error) {
      // A 23505 here is the unique index on external_event_id doing its job:
      // the same provider event arrived twice. That is information, not a
      // failure, and the caller decides what it means.
      log.error('payment_events.write_failed', {
        eventType: event.eventType,
        stage: event.stage ?? null,
        reason: error.message,
      })
    }
  } catch (err) {
    log.error('payment_events.write_threw', { eventType: event.eventType, err })
  }
}
