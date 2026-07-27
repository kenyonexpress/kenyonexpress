import { z } from 'zod'

/**
 * Payout statement vocabulary for the admin screen.
 *
 * The one piece of real logic here is `payoutState`. `payout_statements.status`
 * alone is ambiguous: a run that fell below the supplier's minimum is written as
 * `cancelled` with `rolled_over = true` (migration 081, rule C8), and so is a run
 * an admin cancelled by hand. Reading the enum on its own therefore reports a
 * deliberate rollover as an abandoned statement, which is exactly backwards --
 * a rollover means the money is still owed and will be collected by the next
 * run, while a cancellation means the statement was abandoned.
 */

export const PAYOUT_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'paid',
  'cancelled',
] as const

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

/** What the admin actually needs to tell apart, which is not the enum. */
export type PayoutState = PayoutStatus | 'rolled_over'

export const PAYOUT_STATE_LABELS: Record<PayoutState, string> = {
  draft: 'טיוטה',
  pending_approval: 'ממתין לאישור',
  approved: 'מאושר לתשלום',
  paid: 'שולם',
  cancelled: 'בוטל',
  rolled_over: 'מתגלגל לריצה הבאה',
}

export const PAYOUT_STATE_VARIANTS: Record<PayoutState, 'gray' | 'yellow' | 'green' | 'red'> = {
  draft: 'gray',
  pending_approval: 'yellow',
  approved: 'green',
  paid: 'green',
  cancelled: 'red',
  rolled_over: 'yellow',
}

export const PAYOUT_LINE_TYPE_LABELS: Record<string, string> = {
  physical_delivery: 'מסירה פיזית',
  adjustment: 'התאמה',
  // Kept only so historic statements written before the 2026-07-28 reversal
  // still render. Nothing produces this line type any more: the whole coupon
  // prepayment is platform revenue and the supplier collects the counter
  // balance directly, so a redeemed voucher moves no money through us.
  coupon_redemption: 'מימוש קופון (היסטורי)',
}

export function payoutState(row: { status: string; rolled_over?: boolean | null }): PayoutState {
  if (row.status === 'cancelled' && row.rolled_over) return 'rolled_over'
  return (PAYOUT_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as PayoutStatus)
    : 'draft'
}

/** Approving is only meaningful on a run that produced lines and is still live. */
export function canApprove(row: { status: string; rolled_over?: boolean | null }): boolean {
  return payoutState(row) === 'pending_approval'
}

/** Money only leaves after an explicit approval, never straight off generation. */
export function canMarkPaid(row: { status: string; rolled_over?: boolean | null }): boolean {
  return payoutState(row) === 'approved'
}

export function canCancel(row: { status: string; rolled_over?: boolean | null }): boolean {
  const state = payoutState(row)
  return state === 'draft' || state === 'pending_approval' || state === 'approved'
}

/**
 * A statement is only payable once every line has cleared its T+3 business-day
 * hold. The database enforces this with a trigger; the screen reads the same
 * field so it can disable the button instead of offering an action that throws.
 */
export function isHeld(row: { available_at?: string | null }, now: Date = new Date()): boolean {
  if (!row.available_at) return false
  return new Date(row.available_at).getTime() > now.getTime()
}

// The period is inclusive of both dates and generate_payout_statement rejects
// period_end <= period_start at the table CHECK, so the form has to as well.
export const generatePayoutSchema = z
  .object({
    supplierId: z.string().uuid('ספק לא תקין'),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך התחלה לא תקין'),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך סיום לא תקין'),
  })
  .refine((v) => v.periodEnd > v.periodStart, {
    message: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
    path: ['periodEnd'],
  })

export const markPaidSchema = z.object({
  statementId: z.string().uuid('מזהה לא תקין'),
  // The reference is what ties our record to the bank transfer. A payout marked
  // paid with nothing to reconcile against is indistinguishable from one that
  // was never sent.
  reference: z.string().trim().min(3, 'נדרשת אסמכתת תשלום').max(120),
})

/** ILS from the numeric(12,2) columns the payout tables store money in. */
export function shekels(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  return `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
