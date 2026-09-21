'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import {
  adjustmentSchema,
  canAdjust,
  generatePayoutSchema,
  markPaidSchema,
} from '@/lib/admin/payouts'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { agorot, agorotToIls, parseIls } from '@/lib/money'
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

/**
 * Manual adjustment: one `adjustment` line and the statement total moved by
 * the same amount.
 *
 * Not an RPC, because none exists for it and this repository does not apply
 * migrations. Two writes, so the order matters: the line first, and if the
 * total then fails to move the line is deleted again. A line without its
 * total would print a statement whose sum disagrees with its rows; a total
 * without its line would move money nobody can point at. Neither is left
 * behind. `gross_ils` and `platform_fee_ils` stay 0: an adjustment is money
 * between the platform and the supplier, not a sale, so it changes neither
 * GMV nor the fee.
 */
async function runAddPayoutAdjustment(input: {
  statementId: string
  amountIls: string
  reason: string
}): Promise<ActionResult> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  let amountAgorot: number
  try {
    amountAgorot = parseIls(input.amountIls)
  } catch {
    return { error: 'סכום לא תקין' }
  }
  const parsed = adjustmentSchema.safeParse({
    statementId: input.statementId,
    amountAgorot,
    reason: input.reason,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }
  const { statementId, reason } = parsed.data
  const amount = agorot(parsed.data.amountAgorot)

  const supabase = await createClient()
  const { data: statement, error: readError } = await supabase
    .from('payout_statements')
    .select('id, statement_number, status, rolled_over, total_payout_ils, supplier_id')
    .eq('id', statementId)
    .is('deleted_at', null)
    .maybeSingle()
  if (readError) return { error: reportError(readError, 'payout_statements') }
  if (!statement) return { error: 'דוח לא נמצא' }
  if (!canAdjust(statement)) {
    return { error: 'אפשר להתאים רק דוח שעדיין לא אושר. בטל את האישור או צור דוח חדש.' }
  }

  const { data: line, error: lineError } = await supabase
    .from('payout_statement_lines')
    .insert({
      statement_id: statementId,
      line_type: 'adjustment',
      description: reason,
      quantity: 1,
      gross_ils: 0,
      platform_fee_ils: 0,
      payout_ils: agorotToIls(amount),
      platform_percent: null,
    })
    .select('id')
    .single()
  if (lineError) return { error: reportError(lineError, 'payout_statement_lines') }

  const before = parseIls(statement.total_payout_ils ?? 0)
  const after = agorot(before + amount)
  const { error: totalError } = await supabase
    .from('payout_statements')
    .update({ total_payout_ils: agorotToIls(after) })
    .eq('id', statementId)
    .eq('total_payout_ils', statement.total_payout_ils ?? 0)
  if (totalError) {
    const { error: undoError } = await supabase
      .from('payout_statement_lines')
      .delete()
      .eq('id', line.id)
    log.error('payouts.adjustment_total_failed', {
      statementId,
      reason: totalError.message,
      undone: !undoError,
      undoReason: undoError?.message ?? null,
    })
    return { error: reportError(totalError, 'payout_statements') }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'payout_statements',
    entityId: statementId,
    changes: {
      adjustment_line_id: line.id,
      amount_agorot: amount,
      reason,
      statement_number: statement.statement_number,
      supplier_id: statement.supplier_id,
    },
    before: { total_payout_ils: statement.total_payout_ils },
    after: { total_payout_ils: agorotToIls(after) },
  })

  refresh()
  return { success: `ההתאמה נרשמה על ${statement.statement_number}` }
}

export async function addPayoutAdjustment(input: {
  statementId: string
  amountIls: string
  reason: string
}): Promise<ActionResult> {
  return withActionContext('admin.payout.add_adjustment', () => runAddPayoutAdjustment(input))
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
