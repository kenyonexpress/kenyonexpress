import 'server-only'

import { toE164Israeli } from '@/lib/auth/phone-otp'
import {
  NO_VERIFICATION,
  type ShippingAddressFields,
  type ShippingVerification,
  isCompleteShippingAddress,
  requiresVerifiedShipping,
} from '@/lib/checkout/verified-shipping'
import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsappOtp } from '@/lib/whatsapp/meta-cloud'
import {
  WA_OTP_MAX_ATTEMPTS,
  WA_OTP_TTL_MS,
  hashOtp,
  newOtpCode,
  otpMatches,
} from '@/server/auth/wa-otp'

type Admin = ReturnType<typeof createAdminClient>

/** Order states in which the customer has actually paid. Same list `getMyReviewableItem` used. */
const PAID_STATES = ['paid', 'partially_fulfilled', 'fulfilled', 'platform_settled'] as const

/**
 * How many PAID orders of this customer carry at least one physical line.
 *
 * Counted through `order_items` joined to `orders` with an inner join, so the
 * status and owner filters apply to the parent; the distinct set of order ids
 * is the count. A failed read counts as zero and is logged: the gate is a
 * protection on top of a working checkout, and a database hiccup must not
 * turn into "nobody can buy a physical product".
 */
export async function countPaidPhysicalOrders(admin: Admin, userId: string): Promise<number> {
  const { data, error } = await admin
    .from('order_items')
    .select('order_id, orders!inner(user_id, status)')
    .eq('product_type', 'physical')
    .is('deleted_at', null)
    .eq('orders.user_id', userId)
    .in('orders.status', [...PAID_STATES])
  if (error) {
    log.warn('checkout.physical_order_count_failed', { reason: error.message })
    return 0
  }
  return new Set((data ?? []).map((row) => row.order_id)).size
}

/**
 * Has this account ever proven this phone? A consumed row in `auth_wa_otps`
 * (migration 285) for the same user and the same E.164 number is the proof,
 * whether the code was requested by the checkout or by the WhatsApp sign-in:
 * both deliver to the phone and both consume the row only on the right code.
 * No new table, no new column: the proof already exists.
 */
export async function isPhoneVerifiedForUser(
  admin: Admin,
  userId: string,
  phoneE164: string | null,
): Promise<boolean> {
  if (!phoneE164) return false
  const { data, error } = await admin
    .from('auth_wa_otps' as never)
    .select('id')
    .eq('user_id', userId)
    .eq('phone_e164', phoneE164)
    .not('consumed_at', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) {
    log.warn('checkout.phone_verification_read_failed', { reason: error.message })
    return false
  }
  return data != null
}

/** The gate's full answer for the checkout page, from the saved default address. */
export async function loadShippingVerification(
  admin: Admin,
  userId: string,
  savedAddress: ShippingAddressFields | null,
): Promise<ShippingVerification> {
  const count = await countPaidPhysicalOrders(admin, userId)
  if (!requiresVerifiedShipping(count)) return NO_VERIFICATION
  const addressComplete = savedAddress ? isCompleteShippingAddress(savedAddress) : false
  const phoneVerified = savedAddress
    ? await isPhoneVerifiedForUser(admin, userId, toE164Israeli(savedAddress.phone))
    : false
  return { required: true, addressComplete, phoneVerified }
}

export type IssueOtpResult =
  | { ok: true; channel: 'whatsapp' | 'email' }
  | { ok: false; reason: 'insert_failed' | 'undeliverable' }

/**
 * Sends a six-digit code for the checkout phone. WhatsApp first; when the
 * Meta channel is not configured or refuses the number, the same code goes to
 * the account's email through Resend, so the gate never depends on one
 * vendor being up. Only the HMAC is stored (`hashOtp`), bound to the phone.
 */
export async function issueCheckoutPhoneOtp(
  admin: Admin,
  user: { id: string; email: string | null },
  phoneE164: string,
): Promise<IssueOtpResult> {
  const code = newOtpCode()
  const { error } = await admin.from('auth_wa_otps' as never).insert({
    phone_e164: phoneE164,
    user_id: user.id,
    code_hash: hashOtp(phoneE164, code),
    expires_at: new Date(Date.now() + WA_OTP_TTL_MS).toISOString(),
  } as never)
  if (error) {
    log.error('checkout.phone_otp_insert_failed', { reason: error.message })
    return { ok: false, reason: 'insert_failed' }
  }

  const sent = await sendWhatsappOtp(phoneE164, code)
  if (sent.ok) return { ok: true, channel: 'whatsapp' }
  if (!sent.skipped) log.warn('checkout.phone_otp_whatsapp_failed', { reason: sent.reason })

  if (user.email) {
    const mail = await sendEmail({
      to: user.email,
      subject: `קוד אימות ${code} לאימות הטלפון בקופה`,
      html: `<p>קוד האימות לאימות מספר הטלפון שלכם בקופה הוא: <strong dir="ltr">${code}</strong></p><p>הקוד תקף לעשר דקות.</p>`,
      text: `קוד האימות לאימות מספר הטלפון שלכם בקופה הוא: ${code}. הקוד תקף לעשר דקות.`,
    })
    if (mail.ok) return { ok: true, channel: 'email' }
    log.warn('checkout.phone_otp_email_failed', { reason: mail.reason })
  }
  return { ok: false, reason: 'undeliverable' }
}

export type VerifyOtpResult = 'ok' | 'wrong_code' | 'expired'

/**
 * Checks a code against the newest live row for this user AND this phone.
 * Five wrong guesses burn the row; the first right one consumes it, and the
 * consume is conditional so two concurrent right answers verify once.
 */
export async function verifyCheckoutPhoneOtp(
  admin: Admin,
  userId: string,
  phoneE164: string,
  code: string,
): Promise<VerifyOtpResult> {
  const { data, error: readError } = await admin
    .from('auth_wa_otps' as never)
    .select('id, code_hash, attempts, expires_at')
    .eq('user_id', userId)
    .eq('phone_e164', phoneE164)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  // A failed read is not "no code": answering `expired` would send the customer
  // back to request another SMS for what is our fault.
  if (readError) throw new Error(`checkout otp lookup failed: ${readError.message}`)
  const row = data as { id: string; code_hash: string; attempts: number } | null
  if (!row || row.attempts >= WA_OTP_MAX_ATTEMPTS) return 'expired'

  if (!otpMatches(phoneE164, code, row.code_hash)) {
    await admin
      .from('auth_wa_otps' as never)
      .update({ attempts: row.attempts + 1 } as never)
      .eq('id', row.id)
    return 'wrong_code'
  }

  const { data: consumed, error: consumeError } = await admin
    .from('auth_wa_otps' as never)
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq('id', row.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle()
  if (consumeError) throw new Error(`checkout otp consume failed: ${consumeError.message}`)
  return consumed ? 'ok' : 'expired'
}
