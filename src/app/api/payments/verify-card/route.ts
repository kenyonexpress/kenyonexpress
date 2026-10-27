import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { VERIFICATION_AMOUNT_AGOROT, completeCardVerification } from '@/lib/payments/verify-card'
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
