import { toE164Israeli } from '@/lib/auth/phone-otp'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { sendWhatsappOtp } from '@/lib/whatsapp/meta-cloud'
import { sendTwilioWhatsappOtp } from '@/lib/whatsapp/twilio'
import { WA_OTP_TTL_MS, hashOtp, newOtpCode } from '@/server/auth/wa-otp'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Sends a sign-in code to an existing account's phone over WhatsApp
 * (rc5 F15), through Twilio and then Meta Cloud. Three codes an hour per
 * number. When WhatsApp is not configured, or cannot deliver, the code
 * goes to the account's email instead through Supabase's email OTP.
 *
 * The answer is the same whether or not the number belongs to an account, so
 * the endpoint cannot be used to discover who is registered.
 */
const GENERIC = { ok: true, message: 'אם המספר רשום אצלנו, שלחנו קוד כניסה בוואטסאפ או במייל.' }

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null
  const phone = typeof body?.phone === 'string' ? toE164Israeli(body.phone) : null
  if (!phone) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })

  const ip = await getClientIp()
  if (
    !(await checkRateLimit(`wa-otp-send:${phone}`, 3, 3600)) ||
    !(await checkRateLimit(`wa-otp-send-ip:${ip}`, 20, 3600))
  ) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const admin = createAdminClient()
  // profiles.phone is stored as the customer typed it, so look for the usual
  // spellings of the same number: +972..., 05XXXXXXXX and 05X-XXXXXXX.
  const local = `0${phone.slice(4)}`
  const variants = [phone, local, `${local.slice(0, 3)}-${local.slice(3)}`]
  const { data: matches, error: matchError } = await admin
    .from('profiles')
    .select('id, email')
    .in('phone', variants)
    .limit(2)
  if (matchError) {
    log.error('wa_otp.profile_lookup_failed', { reason: matchError.message })
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
  // Two accounts on one number is ambiguous; sign neither in by phone. A
  // deleted account has its phone cleared (account.ts), so it never matches.
  const profile = matches && matches.length === 1 ? matches[0] : null
  // Same answer as a real WhatsApp send, so the response says nothing about
  // whether this number has an account.
  if (!profile) return NextResponse.json({ ...GENERIC, channel: 'whatsapp' })

  const code = newOtpCode()
  const { error: insertError } = await admin.from('auth_wa_otps' as never).insert({
    phone_e164: phone,
    user_id: profile.id,
    code_hash: hashOtp(phone, code),
    expires_at: new Date(Date.now() + WA_OTP_TTL_MS).toISOString(),
  } as never)
  if (insertError) {
    log.error('wa_otp.insert_failed', { reason: insertError.message })
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }

  // Twilio first, Meta Cloud second; either one delivering is a WhatsApp send.
  const twilio = await sendTwilioWhatsappOtp(phone, code)
  if (twilio.ok) return NextResponse.json({ ...GENERIC, channel: 'whatsapp' })
  if (!('skipped' in twilio)) log.warn('wa_otp.twilio_failed', { reason: twilio.error })

  const sent = await sendWhatsappOtp(phone, code)
  if (sent.ok) return NextResponse.json({ ...GENERIC, channel: 'whatsapp' })
  if (!sent.skipped) log.warn('wa_otp.send_failed', { reason: sent.reason })

  // Fallback: the account's email, through Supabase's own one-time code.
  if (profile.email) {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: profile.email,
      options: { shouldCreateUser: false },
    })
    if (error) log.warn('wa_otp.email_fallback_failed', { reason: error.message })
  }
  return NextResponse.json({ ...GENERIC, channel: 'email' })
}

export const POST = withRequestLog('/api/auth/wa-otp/send', handlePOST)
