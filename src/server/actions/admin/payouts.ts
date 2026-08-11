'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { generatePayoutSchema, markPaidSchema } from '@/lib/admin/payouts'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Supplier payout runs.
 *
 * Every one of these is a thin wrapper over an RPC, on purpose. The money rules
 * -- the T+3 business-day hold, the 100 ILS minimum with rollover, and the fact
 * that only the order-time snapshot may be read (C10) -- live in
 * generate_payout_statement (migration 081) and in the triggers around it. A
 * second implementation here would be a second opinion about what a supplier is
 * owed, and the two would drift.
 *
 * All four RPCs are SECURITY DEFINER and re-check is_admin() themselves, so the
 * requireSection guard here is defence in depth rather than the only gate.
 */

type ActionResult = { error?: string; success?: string }

const idSchema = z.object({ statementId: z.string().uuid('מזהה לא תקין') })

async function guard(): Promise<AdminSessionInfo | null> {
  try {
    return await requireSection('payments', 'write')
  } catch {
    return null
  }
}

function refresh() {
  revalidatePath('/admin/payouts')
}

/**
 * Postgres: undefined_function / undefined_table.
 *
 * MEASURED against production on 2026-08-06: `information_schema` returns ZERO
 * tables matching `%payout%` and ZERO functions matching `%payout%`. Migration
 * 081 was never applied here, so `generate_payout_statement` does not exist and
 * neither does `payout_statements`. Every use of this screen fails, and it used
 * to fail by showing the raw Postgres text to an administrator — which reads as
 * a transient glitch worth retrying rather than as a feature that is not
 * installed.
 */
const UNDEFINED_FUNCTION = '42883'
const UNDEFINED_TABLE = '42P01'

const NOT_INSTALLED =
  'מסך התשלומים לספקים אינו מותקן בבסיס הנתונים הזה: מיגרציה 081 לא הוחלה, ולכן ' +
  'הפונקציה generate_payout_statement והטבלה payout_statements אינן קיימות. ' +
  'עד להחלתה, ההתחייבויות הפתוחות לספקים מוצגות בדוחות מתוך יומן ה-settlement_events.'

/**
 * The one place all four RPCs report a failure.
 *
 * Postgres errors from these are written for an operator and carry the actual
 * reason, so anything unexpected is passed through rather than hidden. The two
 * codes above are the exception: they do not mean the operation failed, they
 * mean the FEATURE is absent, and every one of the four hits them here today.
 */
function reportError(error: { code?: string; message: string }, rpc: string): string {
  if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
    log.error('payouts.not_installed', { rpc, code: error.code, reason: error.message })
    return NOT_INSTALLED
  }
  return readableError(error.message)
}

function readableError(message: string): string {
  if (message.includes('live statement already exists')) {
    return 'כבר קיים דוח פעיל לספק הזה בתקופה הזו. בטל אותו או בחר תקופה אחרת.'
  }
  if (message.includes('unknown supplier')) return 'ספק לא נמצא'
  if (message.includes('admin only')) return 'אין הרשאה'
  if (message.includes('not yet available') || message.includes('available_at')) {
    return 'הדוח עדיין בהמתנה: לא כל השורות עברו את תקופת ההחזקה של 3 ימי עסקים.'
  }
  return message
}

async function runGeneratePayoutStatement(input: {
  supplierId: string
  periodStart: string
  periodEnd: string
}): Promise<ActionResult> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  const parsed = generatePayoutSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('generate_payout_statement', {
    p_supplier_id: parsed.data.supplierId,
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
  })
  if (error) return { error: reportError(error, 'generate_payout_statement') }

  const statementId = typeof data === 'string' ? data : null

  // Read the run back rather than reporting "created": generate_payout_statement
  // can legitimately end in a rollover, and telling the admin a statement was
  // produced when the balance was below the minimum would be a lie by omission.
  const { data: row } = statementId
    ? await supabase
        .from('payout_statements')
        .select('statement_number, status, rolled_over, total_payout_ils, min_payout_ils')
        .eq('id', statementId)
        .maybeSingle()
    : { data: null }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'payout_statements',
    entityId: statementId ?? undefined,
    metadata: {
      supplier_id: parsed.data.supplierId,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      rolled_over: row?.rolled_over ?? false,
      total_payout_ils: row?.total_payout_ils ?? null,
    },
  })

  refresh()

  if (row?.rolled_over) {
    return {
      success: `הריצה מתגלגלת: ${row.total_payout_ils} ש"ח מתחת למינימום של ${row.min_payout_ils} ש"ח. הסכום ייאסף בריצה הבאה.`,
    }
  }
  return { success: `נוצר דוח ${row?.statement_number ?? ''} להמתנה לאישור` }
}

async function runApprovePayoutStatement(statementId: string): Promise<ActionResult> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  const parsed = idSchema.safeParse({ statementId })
  if (!parsed.success) return { error: 'מזהה לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_payout_statement', {
    p_statement_id: parsed.data.statementId,
  })
  if (error) return { error: reportError(error, 'approve_payout_statement') }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'payout_statements',
    entityId: parsed.data.statementId,
    changes: { status: { from: 'pending_approval', to: 'approved' } },
  })

  refresh()
  return { success: 'הדוח אושר לתשלום' }
}

async function runMarkPayoutStatementPaid(input: {
  statementId: string
  reference: string
}): Promise<ActionResult> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  const parsed = markPaidSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_payout_statement_paid', {
    p_statement_id: parsed.data.statementId,
    p_payment_reference: parsed.data.reference,
  })
  if (error) return { error: reportError(error, 'mark_payout_statement_paid') }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'payout_statements',
    entityId: parsed.data.statementId,
    changes: { status: { from: 'approved', to: 'paid' } },
    metadata: { payment_reference: parsed.data.reference },
  })

  refresh()
  return { success: 'הדוח סומן כשולם' }
}

async function runCancelPayoutStatement(statementId: string): Promise<ActionResult> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  const parsed = idSchema.safeParse({ statementId })
  if (!parsed.success) return { error: 'מזהה לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_payout_statement', {
    p_statement_id: parsed.data.statementId,
  })
  if (error) return { error: reportError(error, 'cancel_payout_statement') }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'payout_statements',
    entityId: parsed.data.statementId,
    changes: { status: { from: 'live', to: 'cancelled' } },
  })

  refresh()
  return { success: 'הדוח בוטל והשורות שוחררו לריצה הבאה' }
}

export async function generatePayoutStatement(input: {
  supplierId: string
  periodStart: string
  periodEnd: string
}): Promise<ActionResult> {
  return withActionContext('admin.payout.generate_statement', () =>
    runGeneratePayoutStatement(input),
  )
}

export async function approvePayoutStatement(statementId: string): Promise<ActionResult> {
  return withActionContext('admin.payout.approve_statement', () =>
    runApprovePayoutStatement(statementId),
  )
}

export async function markPayoutStatementPaid(input: {
  statementId: string
  reference: string
}): Promise<ActionResult> {
  return withActionContext('admin.payout.mark_statement_paid', () =>
    runMarkPayoutStatementPaid(input),
  )
}

export async function cancelPayoutStatement(statementId: string): Promise<ActionResult> {
  return withActionContext('admin.payout.cancel_statement', () =>
    runCancelPayoutStatement(statementId),
  )
}
