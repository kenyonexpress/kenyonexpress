import 'server-only'

import { agorot } from '@/lib/commerce/money'
import { log } from '@/lib/observability/log'
import { getCardcomAccounts, getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { createAdminClient } from '@/lib/supabase/admin'
import { type SupplierLeadPayload, alertTeam, createSupplierLead } from './lead-create'

/**
 * ₪1 card verification for supplier applications (rc5 F07, migration 281).
 *
 * The applicant's card is charged ₪1 on Cardcom's hosted page with a token
 * created alongside (`ChargeAndCreateToken`); the charge is then voided. The
 * hosted page is the only place card data is typed: this server never sees a
 * card number, only the token and last four digits Cardcom returns.
 *
 * TRUST. The redirect back and Cardcom's indicator call are both only a
 * prompt to look: the verdict comes from `verifyLowProfile` (GetLpResult),
 * server to server, and must report the exact ₪1 this attempt asked for.
 *
 * ONE PROCESSOR. The redirect and the indicator usually arrive together, so
 * `started -> processing` is a conditional update and whoever loses it just
 * reads the outcome.
 */

const VERIFICATION_AMOUNT_AGOROT = agorot(100)

/**
 * C101: a charge on a live (non-sandbox) Cardcom terminal needs
 * PAYMENTS_PROD_ENABLED=true. Mock and sandbox terminals never touch real money
 * and are always allowed.
 */
export function liveChargeAllowed(
  providerName: string,
  sandbox: boolean,
  source: Record<string, string | undefined> = process.env,
): boolean {
  if (providerName !== 'cardcom' || sandbox) return true
  return source.PAYMENTS_PROD_ENABLED === 'true'
}

export type StartOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'done'; status: 'verified' | 'failed' }
  | { kind: 'unavailable' }
  | { kind: 'error' }

export async function startSupplierCardVerification(input: {
  payload: SupplierLeadPayload
  ip: string | null
  userAgent: string | null
}): Promise<StartOutcome> {
  const admin = createAdminClient()
  const ip = input.ip && /^[0-9a-fA-F.:]{3,45}$/.test(input.ip) ? input.ip : null

  const { data: row, error } = await admin
    .from('supplier_card_verifications' as never)
    .insert({
      email: input.payload.email.toLowerCase(),
      payload: input.payload,
      amount_agorot: VERIFICATION_AMOUNT_AGOROT,
      ip_address: ip,
      user_agent: input.userAgent?.slice(0, 512) ?? null,
    } as never)
    .select('id')
    .single()
  if (error || !row) {
    log.error('supplier_card.insert_failed', { reason: error?.message ?? 'no row' })
    return { kind: 'error' }
  }
  const id = (row as { id: string }).id

  let provider: ReturnType<typeof getPaymentProvider>
  let appUrl: string
  try {
    provider = getPaymentProvider()
    appUrl = loadCardcomEnv().appUrl.replace(/\/+$/, '')
    if (!liveChargeAllowed(provider.name, getCardcomAccounts().platform.sandbox)) {
      throw new Error('PAYMENTS_PROD_ENABLED is not true: live card charge blocked')
    }
  } catch (err) {
    // No terminal configured. The applicant did nothing wrong, so the team
    // gets the application by mail; no lead row is created without a card.
    await admin
      .from('supplier_card_verifications' as never)
      .update({
        status: 'unavailable',
        failure_reason: String(err instanceof Error ? err.message : err).slice(0, 500),
        completed_at: new Date().toISOString(),
      } as never)
      .eq('id', id)
    await alertTeam(input.payload, 'בקשת ספק בלי אימות כרטיס (ספק תשלום לא מוגדר)')
    return { kind: 'unavailable' }
  }

  const back = `${appUrl}/api/supplier-apply/card-verify?v=${id}`
  try {
    const lp = await provider.createLowProfile({
      paymentId: id,
      orderId: id,
      orderNumber: `SUP-${id.slice(0, 8)}`,
      amountAgorot: VERIFICATION_AMOUNT_AGOROT,
      saveToken: true,
      successRedirectUrl: back,
      failedRedirectUrl: `${back}&failed=1`,
      webhookUrl: back,
      description: 'אימות כרטיס ספק (1 ש"ח, יבוטל)',
    })
    await admin
      .from('supplier_card_verifications' as never)
      .update({ low_profile_code: lp.lowProfileId } as never)
      .eq('id', id)

    // The mock keeps its deals in this process's memory, so it is verified in
    // the same request rather than across a redirect another instance serves.
    if (provider.name === 'mock') {
      const status = await completeSupplierCardVerification(id)
      return { kind: 'done', status: status === 'verified' ? 'verified' : 'failed' }
    }
    return { kind: 'redirect', url: lp.redirectUrl }
  } catch (err) {
    log.error('supplier_card.lowprofile_failed', {
      verification_id: id,
      reason: err instanceof Error ? err.message : String(err),
    })
    await admin
      .from('supplier_card_verifications' as never)
      .update({
        status: 'failed',
        failure_reason: 'lowprofile_create_failed',
        completed_at: new Date().toISOString(),
      } as never)
      .eq('id', id)
    return { kind: 'error' }
  }
}

type Row = {
  id: string
  status: string
  payload: SupplierLeadPayload
  low_profile_code: string | null
  amount_agorot: number
  ip_address: string | null
  user_agent: string | null
}

export async function completeSupplierCardVerification(
  id: string,
  opts: { reportedFailure?: boolean } = {},
): Promise<'verified' | 'failed' | 'pending'> {
  const admin = createAdminClient()

  const { data: claimed, error: claimError } = await admin
    .from('supplier_card_verifications' as never)
    .update({ status: 'processing' } as never)
    .eq('id', id)
    .eq('status', 'started')
    .select('id, status, payload, low_profile_code, amount_agorot, ip_address, user_agent')
    .maybeSingle()
  if (claimError) {
    log.error('supplier_card.claim_failed', { verification_id: id, reason: claimError.message })
    return 'pending'
  }
  if (!claimed) {
    // Someone else processed it, or it never existed. Report what is there.
    const { data: current, error: currentError } = await admin
      .from('supplier_card_verifications' as never)
      .select('status')
      .eq('id', id)
      .maybeSingle()
    if (currentError) return 'pending'
    const status = (current as { status?: string } | null)?.status
    return status === 'verified' ? 'verified' : status === 'failed' ? 'failed' : 'pending'
  }
  const row = claimed as unknown as Row

  const fail = async (reason: string) => {
    await admin
      .from('supplier_card_verifications' as never)
      .update({
        status: 'failed',
        failure_reason: reason,
        completed_at: new Date().toISOString(),
      } as never)
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
    log.error('supplier_card.verify_failed', {
      verification_id: id,
      reason: err instanceof Error ? err.message : String(err),
    })
    return null
  })
  if (!result) {
    // Could not ask. Put it back so the next prompt can try again.
    await admin
      .from('supplier_card_verifications' as never)
      .update({ status: 'started' } as never)
      .eq('id', id)
    return 'pending'
  }
  // The redirect's failed=1 is a hint, never the verdict: a forged or stale
  // flag must not refuse a card Cardcom charged, which would also leave the
  // shekel un-voided.
  if (!result.success) return fail(opts.reportedFailure ? 'declined_reported' : 'declined')
  if (result.amountAgorot !== row.amount_agorot) return fail('amount_mismatch')
  if (!result.token) return fail('no_token')

  const { error: tokenError } = await admin.from('supplier_card_tokens' as never).insert({
    verification_id: id,
    token: result.token.token,
    card_last4: /^[0-9]{4}$/.test(result.token.last4) ? result.token.last4 : null,
    card_brand: result.token.brand,
    expiry_month: result.token.expiryMonth,
    expiry_year: result.token.expiryYear,
  } as never)
  if (tokenError) {
    log.error('supplier_card.token_insert_failed', {
      verification_id: id,
      reason: tokenError.message,
    })
    return fail('token_store_failed')
  }

  // Give the shekel back. A failed void is logged for the team, not a reason
  // to refuse an applicant whose card did verify.
  let voided = false
  if (result.transactionId) {
    const refund = await provider
      .refundByTransactionId({
        transactionId: result.transactionId,
        amountAgorot: VERIFICATION_AMOUNT_AGOROT,
        cancelOnly: true,
        description: 'ביטול אימות כרטיס ספק',
      })
      .catch(() => null)
    voided = refund?.success === true
    if (!voided) log.warn('supplier_card.void_failed', { verification_id: id })
  }

  const lead = await createSupplierLead(row.payload, row.ip_address, {
    verificationId: id,
    userAgent: row.user_agent,
  })
  if (lead.ok) {
    await admin
      .from('supplier_card_tokens' as never)
      .update({ supplier_lead_id: lead.leadId } as never)
      .eq('verification_id', id)
  }
  await admin
    .from('supplier_card_verifications' as never)
    .update({
      status: 'verified',
      transaction_id: result.transactionId,
      voided,
      supplier_lead_id: lead.ok ? lead.leadId : null,
      failure_reason: lead.ok ? null : 'lead_insert_failed',
      completed_at: new Date().toISOString(),
    } as never)
    .eq('id', id)
  return 'verified'
}
