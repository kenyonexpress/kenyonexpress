import { agorot } from '@/lib/commerce/money'
import { log } from '@/lib/observability/log'
import { capturePaymentAlarm } from '@/lib/observability/sentry'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

const VERIFICATION_AMOUNT_AGOROT = agorot(1)

// CARDCOM_1ILS_VERIFY is a kill switch: the flow is live by default and only an
// explicit "0"/"false" turns it off.
function verifyEnabled(): boolean {
  const raw = process.env.CARDCOM_1ILS_VERIFY?.trim().toLowerCase()
  return raw !== '0' && raw !== 'false'
}

async function handlePOST(_request: NextRequest): Promise<NextResponse> {
  if (!verifyEnabled()) {
    return NextResponse.json({ error: 'verification_disabled' }, { status: 503 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Each call opens a hosted payment page with the provider; bound a held-down button.
  if (!(await checkRateLimit(`verify-card:${user.id}`, 5, 3600))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const admin = createAdminClient()

  // Create a card verification record
  const { data: verification, error: insertError } = await admin
    .from('payment_card_verifications')
    .insert({
      profile_id: user.id,
      amount_agorot: VERIFICATION_AMOUNT_AGOROT,
    })
    .select('id')
    .single()

  if (insertError || !verification) {
    log.error('verify_card.insert_failed', { reason: insertError?.message ?? 'no row' })
    return NextResponse.json({ error: 'verification_creation_failed' }, { status: 500 })
  }

  const id = (verification as { id: string }).id

  let provider: ReturnType<typeof getPaymentProvider>
  let appUrl: string
  try {
    provider = getPaymentProvider()
    appUrl = loadCardcomEnv().appUrl.replace(/\/+$/, '')
  } catch (err) {
    await admin
      .from('payment_card_verifications')
      .update({
        status: 'unavailable',
        failure_reason: String(err instanceof Error ? err.message : err).slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ error: 'payment_provider_unavailable' }, { status: 503 })
  }

  const back = `${appUrl}/api/payments/verify-card/callback?v=${id}`
  try {
    const lp = await provider.createLowProfile({
      paymentId: id,
      orderId: id,
      orderNumber: `VER-${id.slice(0, 8)}`,
      amountAgorot: VERIFICATION_AMOUNT_AGOROT,
      saveToken: true,
      successRedirectUrl: back,
      failedRedirectUrl: `${back}&failed=1`,
      webhookUrl: back,
      description: 'אימות כרטיס אשראי בסך אגורה אחת שתוחזר מיד',
    })

    await admin
      .from('payment_card_verifications')
      .update({ low_profile_code: lp.lowProfileId })
      .eq('id', id)

    // Mock provider handles verification in same request
    if (provider.name === 'mock') {
      const status = await completeCardVerification(id)
      if (status === 'verified') {
        return NextResponse.json({
          status: 'verified',
          message: 'Card verified successfully',
        })
      }
      return NextResponse.json({ error: 'verification_failed', status }, { status: 400 })
    }

    return NextResponse.json({ redirectUrl: lp.redirectUrl })
  } catch (err) {
    log.error('verify_card.lowprofile_failed', {
      verification_id: id,
      reason: err instanceof Error ? err.message : String(err),
    })
    await admin
      .from('payment_card_verifications')
      .update({
        status: 'failed',
        failure_reason: 'lowprofile_create_failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ error: 'lowprofile_creation_failed' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/payments/verify-card', handlePOST)

type Row = {
  id: string
  profile_id: string
  status: string
  low_profile_code: string | null
  amount_agorot: number
}

async function completeCardVerification(
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

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const verificationId = request.nextUrl.searchParams.get('v')
  if (!verificationId) {
    return NextResponse.json({ error: 'missing_verification_id' }, { status: 400 })
  }

  const status = await completeCardVerification(verificationId)
  if (status === 'verified') {
    return NextResponse.json({ status: 'verified', message: 'Card verified successfully' })
  }
  if (status === 'failed') {
    return NextResponse.json({ error: 'verification_failed', status }, { status: 400 })
  }
  return NextResponse.json({ error: 'verification_pending', status }, { status: 202 })
}

export const GET = withRequestLog('/api/payments/verify-card', handleGET)
