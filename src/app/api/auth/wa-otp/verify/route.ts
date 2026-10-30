import { recordAuthAttempt } from '@/lib/auth/auth-fallback'
import { toE164Israeli } from '@/lib/auth/phone-otp'
import { getSupabaseFlags } from '@/lib/flags/supabase-flags'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { mintSessionFor } from '@/server/auth/mint-session'
import { WA_OTP_MAX_ATTEMPTS, otpMatches } from '@/server/auth/wa-otp'
import { recordOtpAttempt, waOtpEnabled } from '@/server/auth/wa-otp-gate'
import { markMilestoneVerified } from '@/server/verification/user-milestones'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Checks a WhatsApp sign-in code and signs the account in (rc5 F15). Only the
 * newest live code for the number counts; three wrong guesses burn it. The
 * emailed fallback code is the same code, so it is checked here too.
 *
 * C65: Also marks phone verification milestone as verified when successful.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!(await getSupabaseFlags()).wa_otp_enabled) {
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 404 })
  }
  const body = (await request.json().catch(() => null)) as {
    phone?: unknown
    code?: unknown
  } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!/^[0-9]{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 })
  }

  const phone = typeof body?.phone === 'string' ? toE164Israeli(body.phone) : null
  if (!phone) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })
  if (!(await checkRateLimit(`wa-otp-verify:${phone}`, 10, 3600))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const admin = createAdminClient()
  const { data, error: lookupError } = await admin
    .from('auth_wa_otps' as never)
    .select('id, user_id, code_hash, attempts, expires_at')
    .eq('phone_e164', phone)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lookupError) {
    log.error('wa_otp.lookup_failed', { reason: lookupError.message })
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
  const row = data as {
    id: string
    user_id: string
    code_hash: string
    attempts: number
  } | null
  if (!row || row.attempts >= WA_OTP_MAX_ATTEMPTS) {
    await recordOtpAttempt({ phone, kind: 'verify', channel: 'whatsapp', outcome: 'expired' })
    return NextResponse.json({ ok: false, error: 'expired' }, { status: 400 })
  }

  if (!otpMatches(phone, code, row.code_hash)) {
    await admin
      .from('auth_wa_otps' as never)
      .update({ attempts: row.attempts + 1 } as never)
      .eq('id', row.id)
    await recordAuthAttempt({
      userId: row.user_id,
      phone,
      attemptType: 'whatsapp_otp',
      success: false,
    })
    await recordOtpAttempt({
      phone,
      userId: row.user_id,
      kind: 'verify',
      channel: 'whatsapp',
      outcome: 'wrong_code',
    })
    return NextResponse.json({ ok: false, error: 'wrong_code' }, { status: 400 })
  }

  // Consume first, conditionally, so two concurrent right answers sign in once.
  const { data: consumed, error: consumeError } = await admin
    .from('auth_wa_otps' as never)
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq('id', row.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle()
  if (consumeError) {
    log.error('wa_otp.consume_failed', { reason: consumeError.message })
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
  if (!consumed) return NextResponse.json({ ok: false, error: 'expired' }, { status: 400 })

  const session = await mintSessionFor(row.user_id)
  if (!session.ok) {
    await recordAuthAttempt({
      userId: row.user_id,
      phone,
      attemptType: 'whatsapp_otp',
      success: false,
    })
    return NextResponse.json(
      { ok: false, error: session.reason === 'no_email' ? 'no_email' : 'session_failed' },
      { status: session.reason === 'no_email' ? 409 : 500 },
    )
  }

  // C65: Mark milestone as verified after successful phone sign-in
  // This is non-blocking: if it fails, the sign-in still succeeded
  await markMilestoneVerified(row.user_id, 'phone_verification_after_5_orders', {
    phone,
    method: 'auth_whatsapp_otp',
    verified_via: 'sign_in',
  })

  // C100: evidence log of the proven phone. Best effort; the table and the
  // channel column arrive with migration 317.
  const { data: chan } = await admin
    .from('auth_wa_otps' as never)
    .select('channel')
    .eq('id', row.id)
    .maybeSingle()
  const channel = (chan as { channel?: string } | null)?.channel ?? 'whatsapp'
  await admin
    .from('user_phone_verifications' as never)
    .insert({ user_id: row.user_id, phone_e164: phone, channel, purpose: 'sign_in' } as never)

  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/auth/wa-otp/verify', handlePOST)
