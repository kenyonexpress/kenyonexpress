import 'server-only'

import { adminAlertRecipient } from '@/lib/email/admin-alerts'
import { sendEmail } from '@/lib/email/resend'
import { SUPPLIER_AGREEMENT_VERSION } from '@/lib/legal/supplier-agreement'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/** The validated supplier application, as the form submitted it. */
export interface SupplierLeadPayload {
  business_name: string
  contact_name: string
  email: string
  phone: string
  city: string
  category: string
  website: string
  message: string
  agreement_hash: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function leadLines(p: SupplierLeadPayload): string[] {
  return [
    `עסק: ${p.business_name}`,
    `איש קשר: ${p.contact_name}`,
    `מייל: ${p.email}`,
    `טלפון: ${p.phone}`,
    p.city ? `עיר: ${p.city}` : '',
    p.category ? `תחום: ${p.category}` : '',
    p.website ? `אתר: ${p.website}` : '',
    p.message ? `\n${p.message}` : '',
  ].filter(Boolean)
}

/** Tells the team about an application, with or without a lead row behind it. */
export async function alertTeam(p: SupplierLeadPayload, subjectPrefix: string): Promise<void> {
  const lines = leadLines(p)
  const result = await sendEmail({
    to: adminAlertRecipient(),
    subject: `${subjectPrefix}: ${p.business_name}`,
    text: lines.join('\n'),
    html: `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:2">${lines
      .map((line) => escapeHtml(line))
      .join('<br>')}</div>`,
    replyTo: p.email,
  })
  if (!result.ok && !result.skipped) {
    log.warn('supplier_lead.alert_failed', { reason: result.reason })
  }
}

/**
 * Creates the supplier lead, its click-wrap acceptance record and the team
 * alert. Called only after the applicant's card verified (rc5 F07), so a lead
 * row now always has a verified card behind it.
 */
export async function createSupplierLead(
  p: SupplierLeadPayload,
  ip: string | null,
  opts?: { verificationId?: string; userAgent?: string | null },
): Promise<{ ok: true; leadId: string } | { ok: false }> {
  const admin = createAdminClient()
  const { data: lead, error } = await admin
    .from('supplier_leads')
    .insert({
      business_name: p.business_name,
      contact_name: p.contact_name,
      email: p.email.toLowerCase(),
      phone: p.phone,
      city: p.city || null,
      category: p.category || null,
      website: p.website || null,
      message: p.message || null,
    })
    .select('id')
    .single()
  if (error || !lead) {
    log.error('supplier_lead.insert_failed', { reason: error?.message ?? 'no row' })
    return { ok: false }
  }

  // C29: Record click-wrap agreement in dedicated supplier_agreements table
  const { error: agreementError } = await admin.from('supplier_agreements' as never).insert({
    supplier_lead_id: lead.id,
    verification_id: opts?.verificationId ?? null,
    version_hash: p.agreement_hash,
    version_date: SUPPLIER_AGREEMENT_VERSION,
    ip_address: ip && /^[0-9a-fA-F.:]+$/.test(ip) ? ip : null,
    user_agent: opts?.userAgent?.slice(0, 512) ?? null,
  } as never)
  if (agreementError) {
    log.error('supplier_lead.agreement_record_failed', { reason: agreementError.message })
  }

  const { error: acceptError } = await admin.from('audit_log').insert({
    actor_id: null,
    actor_role: 'anon',
    action: 'created',
    entity_type: 'supplier_agreement_acceptance',
    entity_id: lead.id,
    changes: {
      new: {
        version: SUPPLIER_AGREEMENT_VERSION,
        hash: p.agreement_hash,
        accepted_at: new Date().toISOString(),
        email: p.email.toLowerCase(),
      },
    },
    metadata: { source: 'supplier-lead-form' },
    ip_address: ip && /^[0-9a-fA-F.:]+$/.test(ip) ? ip : null,
  })
  if (acceptError) log.error('supplier_lead.acceptance_failed', { reason: acceptError.message })

  await alertTeam(p, 'ליד ספק חדש (כרטיס אומת)')
  return { ok: true, leadId: lead.id }
}
