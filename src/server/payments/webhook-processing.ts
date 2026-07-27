import { getPaymentProvider, resolveAccountByKey } from '@/lib/payments'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendPaymentEvent } from '@/server/payments/events'
import { finalizeOrder } from '@/server/payments/finalize'
import type { Json } from '@/types/database'

/**
 * The processing half of the Cardcom webhook, shared by the live endpoint and
 * the retry driver. Everything here is idempotent: the caller may run it any
 * number of times for the same low-profile id.
 *
 * `verify_failed` is the only retriable outcome (Cardcom unreachable or not
 * yet consistent); every other outcome is final.
 */
export type WebhookProcessResult =
  | { status: 'finalized'; orderId: string; replay: boolean }
  | { status: 'payment_not_found' }
  | { status: 'already_failed' }
  | { status: 'verify_failed'; detail: string }
  | { status: 'amount_mismatch'; expected: number; got: number }
  | { status: 'finalize_error'; detail: string }

export function isRetriable(result: WebhookProcessResult): boolean {
  return result.status === 'verify_failed' || result.status === 'finalize_error'
}

export async function processCardcomLowProfile(
  lowProfileId: string,
  actor: 'webhook' | 'retry-queue',
): Promise<WebhookProcessResult> {
  const admin = createAdminClient()

  const { data: payment } = await admin
    .from('payments')
    .select('id, order_id, status, amount_ils, cardcom_account_key')
    .eq('cardcom_low_profile_id', lowProfileId)
    .maybeSingle()
  if (!payment) return { status: 'payment_not_found' }
  if (payment.status === 'failed') return { status: 'already_failed' }

  // Re-verify against the SAME terminal that charged (multi-account rule).
  const account = await resolveAccountByKey(admin, payment.cardcom_account_key as string | null)
  const provider = getPaymentProvider(account)

  let verified: Awaited<ReturnType<typeof provider.verifyLowProfile>>
  try {
    verified = await provider.verifyLowProfile(lowProfileId)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'verify threw'
    return { status: 'verify_failed', detail }
  }
  if (!verified.success || verified.amountAgorot === null) {
    return { status: 'verify_failed', detail: 'provider reports unverified' }
  }

  const expectedAgorot = Math.round(Number(payment.amount_ils) * 100)
  if (verified.amountAgorot !== expectedAgorot) {
    await admin.from('audit_log').insert({
      actor_id: null,
      actor_role: null,
      action: 'manual_override',
      entity_type: 'payment',
      entity_id: payment.id,
      changes: {} as Json,
      metadata: {
        alarm: 'cardcom_amount_mismatch',
        expected_agorot: expectedAgorot,
        got_agorot: verified.amountAgorot,
      } as unknown as Json,
    })
    return { status: 'amount_mismatch', expected: expectedAgorot, got: verified.amountAgorot }
  }

  await appendPaymentEvent(admin, {
    orderId: payment.order_id,
    paymentId: payment.id,
    eventType: 'payment_verified',
    amountAgorot: verified.amountAgorot,
    actor,
    idempotencyKey: `payment:${payment.id}:verified`,
    metadata: { low_profile_id: lowProfileId, account_key: account.key },
  })

  const result = await finalizeOrder({
    orderId: payment.order_id,
    paymentId: payment.id,
    transactionId: verified.transactionId,
    token: verified.token,
  })
  if (!result.ok) {
    return { status: 'finalize_error', detail: result.error }
  }
  return { status: 'finalized', orderId: payment.order_id, replay: result.replay }
}
