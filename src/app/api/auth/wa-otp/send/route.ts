import { toE164Israeli } from '@/lib/auth/phone-otp'
import { sendEmail } from '@/lib/email/resend'
import { getSupabaseFlags } from '@/lib/flags/supabase-flags'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { sendSmsOtp } from '@/lib/sms/send-otp-sms'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { sendWhatsappOtp } from '@/lib/whatsapp/meta-cloud'
import { WA_OTP_TTL_MS, hashOtp, newOtpCode } from '@/server/auth/wa-otp'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Sends a sign-in code to an existing account's phone over WhatsApp
 * (rc5 F15, C100). When WhatsApp cannot deliver, the same code goes by SMS,
 * then to the account's email through Resend; a transient failure sends
 * nothing and the caller can retry.
 *
 * The answer is the same whether or not the number belongs to an account, so
 * the endpoint cannot be used to discover who is registered.
 */
const GENERIC = { ok: true, message: 'אם המספר רשום אצלנו, שלחנו קוד כניסה בוואטסאפ או במייל.' }

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!(await getSupabaseFlags()).wa_otp_enabled) {
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 404 })
  }
  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null
  const phone = typeof body?.phone === 'string' ? toE164Israeli(body.phone) : null
  if (!phone) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })

  const ip = await getClientIp()
  if (
    !(await checkRateLimit(`wa-otp-send:${phone}`, 3, 900)) ||
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

  const sent = await sendWhatsappOtp(phone, code)
  if (sent.ok) return NextResponse.json({ ...GENERIC, channel: 'whatsapp' })
  if (!sent.skipped) log.warn('wa_otp.send_failed', { reason: sent.reason })

  // WhatsApp did not deliver. Only an unconfigured or template-rejecting Meta
  // falls through (a transient error sends nothing and the caller retries):
  // first SMS to the same number, then the account's email. The same code is
  // verified with the phone whichever channel carried it.
  const fallback = ('templateRejected' in sent && sent.templateRejected) || sent.skipped
  if (!fallback) return NextResponse.json({ ...GENERIC, channel: 'whatsapp' })

  const sms = await sendSmsOtp(phone, code)
  if (sms.ok) {
    await setChannel(admin, phone, code, 'sms')
    return NextResponse.json({ ...GENERIC, channel: 'sms' })
  }
  if (!sms.skipped) log.warn('wa_otp.sms_fallback_failed', { reason: sms.reason })

  if (profile.email) {
    const mail = await sendEmail({
      to: profile.email,
      subject: 'קוד הכניסה שלך לקניון EXPRESS',
      html: `<div dir="rtl"><p>קוד הכניסה שלך:</p><p style="font-size:24px;letter-spacing:4px"><b>${code}</b></p><p>הקוד תקף ל-10 דקות.</p></div>`,
      text: `קוד הכניסה שלך: ${code} (תקף ל-10 דקות)`,
    })
    if (mail.ok) {
      await setChannel(admin, phone, code, 'email')
      return NextResponse.json({ ...GENERIC, channel: 'email' })
    }
    log.warn('wa_otp.email_fallback_failed', { reason: mail.reason })
  }
  return NextResponse.json({ ...GENERIC, channel: 'whatsapp' })
}

/** Best effort: the column arrives with migration 317, so a miss is ignored. */
async function setChannel(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
  code: string,
  channel: 'sms' | 'email',
) {
  await admin
    .from('auth_wa_otps' as never)
    .update({ channel } as never)
    .eq('phone_e164', phone)
    .eq('code_hash', hashOtp(phone, code))
}

export const POST = withRequestLog('/api/auth/wa-otp/send', handlePOST)
