'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import {
  BLOCKLIST_KIND_LABEL_HE,
  MAX_REASON_LENGTH,
  expiryFor,
  isBlocklistKind,
  normalizeBlockValue,
} from '@/lib/fraud/blocklist'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * The operator's side of the fraud layer: clearing a flagged order, deciding a
 * refund request, and recording a dispute.
 *
 * NONE OF THESE MOVE MONEY. Clearing a risk row writes a review; deciding a
 * refund request writes a decision. The refund itself stays in
 * `actions/payments/refund.ts` behind its own session check, its own audit row
 * and the cancellation-fee statute - so approving a request here is an
 * INSTRUCTION to refund, followed by the operator doing it in the refund
 * console, and the queue shows both states separately. Collapsing the two would
 * mean one click in a review queue could refund an order, which is the click
 * nobody should be one mis-tap away from.
 *
 * EVERY ONE WRITES AN AUDIT ROW, because that is the project rule and because
 * the interesting question about a fraud queue six months later is not what it
 * decided but who decided it.
 */

export type FraudActionState = { error: string } | { success: string } | null

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

/** The one sentence every page here shows when 202 is not applied. */
const NOT_APPLIED =
  'הטבלה עדיין לא הוחלה על מסד הנתונים. ראו migrations/pending/202_fraud_abuse.sql'

function missing(code: string | undefined): boolean {
  return MISSING_TABLE.has(code ?? '')
}

// ── Risk review ────────────────────────────────────────────────────────────

const reviewSchema = z.object({
  order_id: z.string().uuid(),
  outcome: z.enum(['cleared', 'refunded', 'blocked']),
  note: z.string().trim().max(1000).optional().default(''),
})

async function runReviewRiskAssessment(
  _: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = reviewSchema.safeParse({
    order_id: formData.get('order_id'),
    outcome: formData.get('outcome'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('order_risk_assessments')
    .update({
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.userId,
      review_outcome: parsed.data.outcome,
      review_note: parsed.data.note || null,
    } as never)
    .eq('order_id', parsed.data.order_id)

  if (error) {
    if (missing(error.code)) return { error: NOT_APPLIED }
    log.error('admin.risk_review_failed', { orderId: parsed.data.order_id, reason: error.message })
    return { error: 'שמירת ההחלטה נכשלה' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'order_risk_assessment',
    entityId: parsed.data.order_id,
    metadata: { outcome: parsed.data.outcome, note: parsed.data.note || null },
  })

  revalidatePath('/admin/fraud')
  return { success: 'ההחלטה נשמרה' }
}

// ── Refund requests ────────────────────────────────────────────────────────

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().min(3, 'חובה לנמק את ההחלטה').max(1000, 'הנימוק ארוך מדי'),
})

async function runDecideRefundRequest(
  _: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = decideSchema.safeParse({
    id: formData.get('id'),
    decision: formData.get('decision'),
    note: formData.get('note'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  // `.eq('status','pending')` is the concurrency control: two operators opening
  // the same queue both see one pending row, and the second update matches
  // nothing rather than overwriting the first decision.
  const { data, error } = await admin
    .from('refund_requests')
    .update({
      status: parsed.data.decision,
      decided_at: new Date().toISOString(),
      decided_by: session.userId,
      decision_note: parsed.data.note,
    } as never)
    .eq('id', parsed.data.id)
    .eq('status', 'pending')
    .select('id')

  if (error) {
    if (missing(error.code)) return { error: NOT_APPLIED }
    log.error('admin.refund_request_decide_failed', {
      requestId: parsed.data.id,
      reason: error.message,
    })
    return { error: 'שמירת ההחלטה נכשלה' }
  }
  if (!data || data.length === 0) {
    return { error: 'הבקשה כבר הוכרעה על ידי מישהו אחר' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'refund_request',
    entityId: parsed.data.id,
    metadata: { decision: parsed.data.decision, note: parsed.data.note },
  })

  revalidatePath('/admin/fraud')
  return {
    success:
      parsed.data.decision === 'approved'
        ? 'הבקשה אושרה. הזיכוי עצמו מתבצע בקונסולת הזיכויים.'
        : 'הבקשה נדחתה',
  }
}

// ── Disputes ───────────────────────────────────────────────────────────────

const disputeSchema = z.object({
  order_id: z.string().uuid({ message: 'מזהה הזמנה לא תקין' }),
  provider_ref: z.string().trim().min(3, 'חובה מספר תיק מהסולק').max(120),
  kind: z.enum(['chargeback', 'retrieval', 'pre_arbitration', 'inquiry']),
  reason_code: z.string().trim().max(60).optional().default(''),
  amount_ils: z.coerce.number().nonnegative('סכום לא תקין'),
  respond_by: z.string().min(4, 'חובה תאריך יעד לתשובה'),
  notes: z.string().trim().max(4000).optional().default(''),
})

async function runOpenDispute(_: FraudActionState, formData: FormData): Promise<FraudActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = disputeSchema.safeParse({
    order_id: formData.get('order_id'),
    provider_ref: formData.get('provider_ref'),
    kind: formData.get('kind'),
    reason_code: formData.get('reason_code') ?? '',
    amount_ils: formData.get('amount_ils'),
    respond_by: formData.get('respond_by'),
    notes: formData.get('notes') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const respondBy = new Date(parsed.data.respond_by)
  if (Number.isNaN(respondBy.getTime())) return { error: 'תאריך יעד לא תקין' }

  // Agorot, integer, through the money rule and not a float multiply. The form
  // takes shekels because that is what the acquirer's letter says.
  const amountAgorot = Math.round(parsed.data.amount_ils * 100)

  const admin = createAdminClient()
  const { error } = await admin.from('disputes').insert({
    order_id: parsed.data.order_id,
    provider_ref: parsed.data.provider_ref,
    kind: parsed.data.kind,
    reason_code: parsed.data.reason_code || null,
    amount_agorot: amountAgorot,
    respond_by: respondBy.toISOString(),
    notes: parsed.data.notes || null,
  } as never)

  if (error) {
    if (missing(error.code)) return { error: NOT_APPLIED }
    // 23505 on `disputes_provider_ref_unique`: the same case entered twice from
    // two emails. Named, because "שמירה נכשלה" would send the operator looking
    // for a bug instead of for the row they already created.
    if (error.code === '23505') return { error: 'תיק עם מספר זה כבר קיים' }
    if (error.code === '23503') return { error: 'הזמנה לא נמצאה' }
    log.error('admin.dispute_insert_failed', { reason: error.message })
    return { error: 'פתיחת התיק נכשלה' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'dispute',
    entityId: parsed.data.provider_ref,
    metadata: {
      order_id: parsed.data.order_id,
      kind: parsed.data.kind,
      amount_agorot: amountAgorot,
    },
  })

  revalidatePath('/admin/fraud')
  return { success: 'התיק נפתח' }
}

const resolveSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['evidence_submitted', 'won', 'lost', 'accepted']),
})

async function runResolveDispute(
  _: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = resolveSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  // The CHECK in 202 requires the two to move together: a terminal status with
  // no `resolved_at` is refused by the database, so it is set here rather than
  // left for a later UPDATE that might never come.
  const terminal = parsed.data.status !== 'evidence_submitted'

  const admin = createAdminClient()
  const { error } = await admin
    .from('disputes')
    .update({
      status: parsed.data.status,
      resolved_at: terminal ? new Date().toISOString() : null,
    } as never)
    .eq('id', parsed.data.id)

  if (error) {
    if (missing(error.code)) return { error: NOT_APPLIED }
    log.error('admin.dispute_update_failed', { id: parsed.data.id, reason: error.message })
    return { error: 'עדכון התיק נכשל' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'dispute',
    entityId: parsed.data.id,
    metadata: { status: parsed.data.status },
  })

  revalidatePath('/admin/fraud')
  return { success: 'התיק עודכן' }
}

export async function reviewRiskAssessment(
  prev: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.risk_review', () => runReviewRiskAssessment(prev, formData))
}

export async function decideRefundRequestAction(
  prev: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.refund_request_decide', () =>
    runDecideRefundRequest(prev, formData),
  )
}

export async function openDispute(
  prev: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.dispute_open', () => runOpenDispute(prev, formData))
}

export async function resolveDispute(
  prev: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.dispute_resolve', () => runResolveDispute(prev, formData))
}

// ---------------------------------------------------------------------------
// Section 57: the blocklist (migration 234). Add with a reason and an optional
// expiry in days; remove with a note. Both audited, both normalised through
// the same function the checkout looks values up with.
// ---------------------------------------------------------------------------

const blocklistAddSchema = z.object({
  kind: z.string(),
  value: z.string().trim().min(1).max(320),
  reason: z.string().trim().min(3).max(MAX_REASON_LENGTH),
  expires_days: z.string().trim().optional().default(''),
})

async function runAddBlocklistEntry(
  _: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  const parsed = blocklistAddSchema.safeParse({
    kind: formData.get('kind'),
    value: formData.get('value'),
    reason: formData.get('reason'),
    expires_days: formData.get('expires_days') ?? '',
  })
  if (!parsed.success) return { error: 'יש למלא סוג, ערך וסיבה (לפחות 3 תווים).' }
  if (!isBlocklistKind(parsed.data.kind)) return { error: 'סוג לא מוכר.' }
  const value = normalizeBlockValue(parsed.data.kind, parsed.data.value)
  if (!value) return { error: `הערך אינו ${BLOCKLIST_KIND_LABEL_HE[parsed.data.kind]} תקין.` }
  const expiresAt = expiryFor(parsed.data.expires_days, new Date())
  if (expiresAt === undefined) return { error: 'תוקף בימים: מספר שלם בין 1 ל-3650, או ריק.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('fraud_blocklist' as never)
    .insert({
      kind: parsed.data.kind,
      value,
      reason: parsed.data.reason,
      expires_at: expiresAt,
      created_by: session.userId,
    } as never)
    .select('id')
    .maybeSingle()
  if (error) {
    if (missing(error.code))
      return { error: NOT_APPLIED.replace('202_fraud_abuse', '234_fraud_blocklist') }
    if (error.code === '23505') return { error: 'הערך הזה כבר חסום.' }
    log.warn('admin.blocklist_add_failed', { reason: error.message })
    return { error: 'ההוספה נכשלה.' }
  }
  const row = data as { id: string } | null
  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'created',
    entityType: 'fraud_blocklist',
    entityId: row?.id ?? null,
    changes: { kind: parsed.data.kind, reason: parsed.data.reason, expires_at: expiresAt },
    // The value itself stays out of the audit row: it is an email, a phone or
    // a card fingerprint, and the audit log is read more widely than this table.
    metadata: { value_hash_prefix: value.slice(0, 3) },
  })
  revalidatePath('/admin/fraud')
  return { success: 'נוסף לרשימת החסימה.' }
}

const blocklistRemoveSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(500).optional().default(''),
})

async function runRemoveBlocklistEntry(
  _: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  const parsed = blocklistRemoveSchema.safeParse({
    id: formData.get('id'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return { error: 'מזהה לא תקין' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('fraud_blocklist' as never)
    .update({
      removed_at: new Date().toISOString(),
      removed_by: session.userId,
      removal_note: parsed.data.note || null,
    } as never)
    .eq('id', parsed.data.id)
    .is('removed_at', null)
    .select('id, kind')
  if (error) {
    if (missing(error.code))
      return { error: NOT_APPLIED.replace('202_fraud_abuse', '234_fraud_blocklist') }
    log.warn('admin.blocklist_remove_failed', { reason: error.message })
    return { error: 'ההסרה נכשלה.' }
  }
  const rows = (data ?? []) as unknown as { id: string; kind: string }[]
  const row = rows[0]
  if (!row) return { error: 'הרשומה לא נמצאה או כבר הוסרה.' }
  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'deleted',
    entityType: 'fraud_blocklist',
    entityId: row.id,
    changes: { removed: true, note: parsed.data.note || null },
    metadata: { kind: row.kind },
  })
  revalidatePath('/admin/fraud')
  return { success: 'הוסר מרשימת החסימה.' }
}

export async function addBlocklistEntry(
  state: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.fraud.blocklist_add', () => runAddBlocklistEntry(state, formData))
}

export async function removeBlocklistEntry(
  state: FraudActionState,
  formData: FormData,
): Promise<FraudActionState> {
  return withActionContext('admin.fraud.blocklist_remove', () =>
    runRemoveBlocklistEntry(state, formData),
  )
}
