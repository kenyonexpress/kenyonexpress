import { agorot } from '@/lib/commerce/money'
import { log } from '@/lib/observability/log'
import { capturePaymentAlarm } from '@/lib/observability/sentry'
import { getPaymentProvider } from '@/lib/payments'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Settles one card verification: claim the row, ask the provider what happened,
 * store the token, void the one-agora charge. Lives here and not in the route
 * file because a Next route module may export only handlers, and both
 * `/api/payments/verify-card` (mock provider, same request) and its callback
 * (real provider redirect/webhook) need it.
 */
export const VERIFICATION_AMOUNT_AGOROT = agorot(1)

type Row = {
  id: string
  profile_id: string
  status: string
  low_profile_code: string | null
  amount_agorot: number
}

export async function completeCardVerification(
  id: string,
  opts: { reportedFailure?: boolean } = {},
): Promise<'verified' | 'failed' | 'pending'> {
  const admin = createAdminClient()

  const { data: claimed, error: claimError } = await admin
    .from('payment_card_verifications')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('status', 'started')
    .select('id, status, profile_id, low_profile_code, amount_agorot')
    .maybeSingle()

  if (claimError) {
    log.error('verify_card.claim_failed', { verification_id: id, reason: claimError.message })
    return 'pending'
  }

  if (!claimed) {
    const { data: current, error: currentError } = await admin
      .from('payment_card_verifications')
      .select('status')
      .eq('id', id)
      .maybeSingle()
    if (currentError) {
      log.error('verify_card.status_read_failed', {
        verification_id: id,
        reason: currentError.message,
      })
      return 'pending'
    }
    const status = (current as { status?: string } | null)?.status
    return status === 'verified' ? 'verified' : status === 'failed' ? 'failed' : 'pending'
  }

  const row = claimed as unknown as Row

  const fail = async (reason: string) => {
    await admin
      .from('payment_card_verifications')
      .update({
        status: 'failed',
        failure_reason: reason,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
    return 'failed' as const
  }

  if (!row.low_profile_code) return fail('no_low_profile')

  let provider: ReturnType<typeof getPaymentProvider>
  try {
    provider = getPaymentProvider()
  } catch {
    return fail('provider_unavailable')
  }

  const result = await provider.verifyLowProfile(row.low_profile_code).catch((err) => {
    log.error('verify_card.verify_failed', {
      verification_id: id,
      reason: err instanceof Error ? err.message : String(err),
    })
    return null
  })

  if (!result) {
    await admin.from('payment_card_verifications').update({ status: 'started' }).eq('id', id)
    return 'pending'
  }

  if (!result.success) return fail(opts.reportedFailure ? 'declined_reported' : 'declined')
  if (result.amountAgorot !== row.amount_agorot) return fail('amount_mismatch')
  if (!result.token) return fail('no_token')

  // Save token to payment_tokens table
  const { data: paymentToken, error: tokenError } = await admin
    .from('payment_tokens')
    .insert({
      profile_id: row.profile_id,
      cardcom_token: result.token.token,
      last_4: /^[0-9]{4}$/.test(result.token.last4) ? result.token.last4 : null,
      card_brand: result.token.brand,
      expiry_month: result.token.expiryMonth,
      expiry_year: result.token.expiryYear,
      cardcom_account_id: (provider as any).account?.id ?? null,
      is_default: true,
    })
    .select('id')
    .single()

  if (tokenError) {
    log.error('verify_card.token_insert_failed', {
      verification_id: id,
      reason: tokenError.message,
    })
    return fail('token_store_failed')
  }

  // Save saved_payment_method to profiles
  const tokenInfo = {
    token_id: (paymentToken as { id: string }).id,
    last_4: result.token.last4,
    brand: result.token.brand,
    expiry_month: result.token.expiryMonth,
    expiry_year: result.token.expiryYear,
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ saved_payment_method: tokenInfo })
    .eq('id', row.profile_id)

  if (profileError) {
    log.error('verify_card.profile_update_failed', {
      verification_id: id,
      reason: profileError.message,
    })
    // Continue - we already saved the token
  }

  // Refund immediately
  let voided = false
  if (result.transactionId) {
    const refund = await provider
      .refundByTransactionId({
        transactionId: result.transactionId,
        amountAgorot: VERIFICATION_AMOUNT_AGOROT,
        cancelOnly: true,
        description: 'ביטול אימות כרטיס אשראי',
      })
      .catch(() => null)
    voided = refund?.success === true
    if (!voided) {
      // Log to Sentry but allow verification to succeed
      log.warn('verify_card.refund_failed', { verification_id: id })
      try {
        await capturePaymentAlarm('card verification refund failed', {
          stage: 'card_verification_refund',
          detail: {
            verification_id: id,
            transaction_id: result.transactionId,
          },
        })
      } catch {
        // Sentry capture failed, but continue
      }
    }
  }

  await admin
    .from('payment_card_verifications')
    .update({
      status: 'verified',
      transaction_id: result.transactionId,
      voided,
      payment_token_id: (paymentToken as { id: string }).id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)

  return 'verified'
}
