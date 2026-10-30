'use server'

import { isSmsCapableIsraeli, toE164Israeli } from '@/lib/auth/phone-otp'
import { getSupabaseFlags } from '@/lib/flags/supabase-flags'
import { supplierAgreementHash } from '@/lib/legal/supplier-agreement'
import { withActionContext } from '@/lib/observability/action-context'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/security/turnstile'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { startSupplierCardVerification } from '@/server/supplier/card-verification'
import { createSupplierLead } from '@/server/supplier/lead-create'
import { headers } from 'next/headers'
import { z } from 'zod'

/**
 * A business asking to sell here.
 *
 * ROW FIRST, MAIL SECOND, AND THE ORDER IS THE WHOLE DESIGN. The contact form
 * next door only mails, which is right for a question: an unanswered question
 * costs one conversation. A supplier lead is a sales pipeline, and a lead lost
 * to a Resend outage or a full inbox is revenue that never arrives and that
 * nobody knows was missed. So the durable record is the row; the email is a
 * notification about it, and a failure to send is logged rather than surfaced
 * to a business that has already given us their details.
 *
 * NO PUBLIC INSERT POLICY ON THE TABLE. `supplier_leads` has no policy for
 * `anon` at all, so the only writer is this action through the admin client. A
 * browser-writable lead table is a spam target with a database behind it.
 *
 * THE PHONE IS VALIDATED THE SAME WAY SIGN-IN VALIDATES IT, through
 * `isSmsCapableIsraeli`. A lead we cannot phone back is a lead we do not have,
 * and this is the one field where a typo is invisible until somebody tries.
 */

const schema = z.object({
  business_name: z.string().trim().min(2, 'נא למלא שם עסק').max(120, 'שם העסק ארוך מדי'),
  contact_name: z.string().trim().min(2, 'נא למלא שם איש קשר').max(80, 'השם ארוך מדי'),
  email: z.string().trim().email('כתובת מייל לא תקינה').max(254),
  phone: z.string().trim().min(9, 'נא למלא טלפון').max(20, 'מספר לא תקין'),
  city: z.string().trim().max(60).optional().default(''),
  category: z.string().trim().max(60).optional().default(''),
  website: z.string().trim().max(200).optional().default(''),
  message: z.string().trim().max(2000, 'ההודעה ארוכה מדי').optional().default(''),
  // Click-wrap: the hash of the exact text on screen, and the tick.
  agreement: z.literal('on', { message: 'יש לאשר את הסכם ההצטרפות' }),
  agreement_hash: z.string(),
  // Bots fill every field. Humans leave this alone (hidden with CSS).
  company: z.string().optional().default(''),
})

export type SupplierLeadState = {
  ok: boolean
  message?: string
  error?: string
  /** Cardcom's hosted card page, for the ₪1 verification. */
  redirectUrl?: string
}

async function runSubmitSupplierLead(
  _prev: SupplierLeadState,
  formData: FormData,
): Promise<SupplierLeadState> {
  const parsed = schema.safeParse({
    business_name: formData.get('business_name'),
    contact_name: formData.get('contact_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    city: formData.get('city') ?? '',
    category: formData.get('category') ?? '',
    website: formData.get('website') ?? '',
    message: formData.get('message') ?? '',
    company: formData.get('company') ?? '',
    agreement: formData.get('agreement'),
    agreement_hash: formData.get('agreement_hash') ?? '',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'בדקו את הפרטים ונסו שוב.' }
  }

  // A form rendered before the text changed must not be recorded as consent to
  // the new text.
  if (parsed.data.agreement_hash !== supplierAgreementHash()) {
    return { ok: false, error: 'נוסח ההסכם התעדכן. רעננו את הדף ואשרו מחדש.' }
  }

  // Honeypot hit: pretend success so the bot does not retry with a new shape.
  if (parsed.data.company) {
    return { ok: true, message: 'תודה, קיבלנו את הפרטים ונחזור אליכם.' }
  }

  if (!isSmsCapableIsraeli(parsed.data.phone)) {
    return { ok: false, error: 'נא להזין מספר טלפון נייד ישראלי (05X).' }
  }

  const ip = await getClientIp()
  if (!(await checkRateLimit(`supplier-lead:${ip}`, 2, 86400))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }
  // rc5 F19: Turnstile, a no-op until TURNSTILE_SECRET_KEY is set.
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip))) {
    return { ok: false, error: 'אימות האבטחה נכשל. רעננו את הדף ונסו שוב.' }
  }

  const phone = toE164Israeli(parsed.data.phone) ?? parsed.data.phone
  const h = await headers()

  // C91: with card_verify_enabled off (default) the card step is skipped and
  // the application becomes a lead directly.
  const cardVerify = (await getSupabaseFlags()).card_verify_enabled

  const payload = {
    business_name: parsed.data.business_name,
    contact_name: parsed.data.contact_name,
    email: parsed.data.email,
    phone,
    city: parsed.data.city,
    category: parsed.data.category,
    website: parsed.data.website,
    message: parsed.data.message,
    agreement_hash: parsed.data.agreement_hash,
  }

  if (!cardVerify) {
    const lead = await createSupplierLead(payload, ip, { userAgent: h.get('user-agent') })
    return lead.ok
      ? { ok: true, message: 'תודה, קיבלנו את הפרטים ונחזור אליכם בהקדם.' }
      : { ok: false, error: 'לא הצלחנו לשמור את הפרטים. נסו שוב או פנו אלינו בוואטסאפ.' }
  }

  // rc5 F07: no lead without a verified card. The application waits on the
  // verification row and becomes a lead only when Cardcom confirms the card.
  const outcome = await startSupplierCardVerification({
    payload,
    ip,
    userAgent: h.get('user-agent'),
  })

  switch (outcome.kind) {
    case 'redirect':
      return { ok: true, redirectUrl: outcome.url }
    case 'done':
      return outcome.status === 'verified'
        ? { ok: true, message: 'הכרטיס אומת. תודה, קיבלנו את הפרטים ונחזור אליכם בהקדם.' }
        : { ok: false, error: 'אימות הכרטיס נכשל. בדקו את פרטי הכרטיס ונסו שוב.' }
    case 'unavailable':
      return {
        ok: false,
        error: 'אימות הכרטיס אינו זמין כרגע. העברנו את הפרטים לצוות ונחזור אליכם.',
      }
    default:
      return {
        ok: false,
        error: 'לא הצלחנו להתחיל את אימות הכרטיס. נסו שוב או פנו אלינו בוואטסאפ.',
      }
  }
}

export async function submitSupplierLead(
  prev: SupplierLeadState,
  formData: FormData,
): Promise<SupplierLeadState> {
  return withActionContext('supplier_lead.submit', () => runSubmitSupplierLead(prev, formData))
}
