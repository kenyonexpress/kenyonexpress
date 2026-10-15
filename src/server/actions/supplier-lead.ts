'use server'

import { isSmsCapableIsraeli, toE164Israeli } from '@/lib/auth/phone-otp'
import { adminAlertRecipient } from '@/lib/email/admin-alerts'
import { sendEmail } from '@/lib/email/resend'
import { SUPPLIER_AGREEMENT_VERSION, supplierAgreementHash } from '@/lib/legal/supplier-agreement'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
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

export type SupplierLeadState = { ok: boolean; message?: string; error?: string }

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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
  if (!(await checkRateLimit(`supplier-lead:${ip}`, 5, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  const phone = toE164Israeli(parsed.data.phone) ?? parsed.data.phone
  const admin = createAdminClient()

  const { data: lead, error } = await admin
    .from('supplier_leads')
    .insert({
      business_name: parsed.data.business_name,
      contact_name: parsed.data.contact_name,
      email: parsed.data.email.toLowerCase(),
      phone,
      city: parsed.data.city || null,
      category: parsed.data.category || null,
      website: parsed.data.website || null,
      message: parsed.data.message || null,
    })
    .select('id')
    .single()

  if (error) {
    log.error('supplier_lead.insert_failed', { reason: error.message })
    return { ok: false, error: 'לא הצלחנו לשמור את הפרטים. נסו שוב או פנו אלינו בוואטסאפ.' }
  }

  // The acceptance record: version, hash, time and IP, in the immutable audit
  // log. No supplier_leads column is needed, so this works before any migration.
  const { error: acceptError } = await admin.from('audit_log').insert({
    actor_id: null,
    actor_role: 'anon',
    action: 'created',
    entity_type: 'supplier_agreement_acceptance',
    entity_id: lead.id,
    changes: {
      new: {
        version: SUPPLIER_AGREEMENT_VERSION,
        hash: parsed.data.agreement_hash,
        accepted_at: new Date().toISOString(),
        email: parsed.data.email.toLowerCase(),
      },
    },
    metadata: { source: 'supplier-lead-form' },
    ip_address: /^[0-9a-fA-F.:]+$/.test(ip) ? ip : null,
  })
  if (acceptError) log.error('supplier_lead.acceptance_failed', { reason: acceptError.message })

  // The row is safe. From here on, a failure costs a notification and not a
  // lead, so it is logged and never shown to the business.
  const lines = [
    `עסק: ${parsed.data.business_name}`,
    `איש קשר: ${parsed.data.contact_name}`,
    `מייל: ${parsed.data.email}`,
    `טלפון: ${phone}`,
    parsed.data.city ? `עיר: ${parsed.data.city}` : '',
    parsed.data.category ? `תחום: ${parsed.data.category}` : '',
    parsed.data.website ? `אתר: ${parsed.data.website}` : '',
    parsed.data.message ? `\n${parsed.data.message}` : '',
  ].filter(Boolean)

  const result = await sendEmail({
    to: adminAlertRecipient(),
    subject: `ליד ספק חדש: ${parsed.data.business_name}`,
    text: lines.join('\n'),
    html: `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:2">${lines
      .map((line) => escapeHtml(line))
      .join('<br>')}</div>`,
    // Replying to the alert reaches the business, which is what an operator
    // will try to do first.
    replyTo: parsed.data.email,
  })
  if (!result.ok && !result.skipped) {
    log.warn('supplier_lead.alert_failed', { reason: result.reason })
  }

  return { ok: true, message: 'תודה, קיבלנו את הפרטים ונחזור אליכם בהקדם.' }
}

export async function submitSupplierLead(
  prev: SupplierLeadState,
  formData: FormData,
): Promise<SupplierLeadState> {
  return withActionContext('supplier_lead.submit', () => runSubmitSupplierLead(prev, formData))
}
