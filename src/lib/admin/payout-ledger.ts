/**
 * The per-supplier payout ledger: every statement line a supplier has been
 * owed, with the statement it belongs to. Pure shaping for the CSV route and
 * the supplier page; the read is in `server/queries/payout-ledger.ts`.
 */

import type { CsvColumn } from '@/lib/reports/csv'
import { PAYOUT_LINE_TYPE_LABELS, PAYOUT_STATE_LABELS, payoutState } from './payouts'

export interface LedgerLine {
  statementNumber: string
  statementStatus: string
  rolledOver: boolean
  periodStart: string
  periodEnd: string
  lineType: string
  description: string | null
  orderItemId: string | null
  quantity: number
  grossIls: number
  platformFeeIls: number
  payoutIls: number
  createdAt: string
  availableAt: string | null
}

export const LEDGER_MAX_ROWS = 5000

export const LEDGER_COLUMNS: readonly CsvColumn<LedgerLine>[] = [
  { header: 'דוח', value: (r) => r.statementNumber },
  {
    header: 'סטטוס דוח',
    value: (r) =>
      PAYOUT_STATE_LABELS[payoutState({ status: r.statementStatus, rolled_over: r.rolledOver })],
  },
  { header: 'תחילת תקופה', value: (r) => r.periodStart },
  { header: 'סוף תקופה', value: (r) => r.periodEnd },
  { header: 'סוג שורה', value: (r) => PAYOUT_LINE_TYPE_LABELS[r.lineType] ?? r.lineType },
  { header: 'תיאור', value: (r) => r.description ?? '' },
  { header: 'פריט הזמנה', value: (r) => r.orderItemId ?? '' },
  { header: 'כמות', value: (r) => String(r.quantity) },
  { header: 'ברוטו (₪)', value: (r) => r.grossIls.toFixed(2) },
  { header: 'עמלת פלטפורמה (₪)', value: (r) => r.platformFeeIls.toFixed(2) },
  { header: 'לתשלום לספק (₪)', value: (r) => r.payoutIls.toFixed(2) },
  { header: 'נוצר', value: (r) => r.createdAt },
  { header: 'משוחרר', value: (r) => r.availableAt ?? '' },
]

export interface LedgerTotals {
  lines: number
  /** Everything on statements that are not cancelled. */
  owedIls: number
  /** The part of it on statements already marked paid. */
  paidIls: number
}

export function ledgerTotals(lines: readonly LedgerLine[]): LedgerTotals {
  let owed = 0
  let paid = 0
  for (const line of lines) {
    if (line.statementStatus === 'cancelled') continue
    owed += line.payoutIls
    if (line.statementStatus === 'paid') paid += line.payoutIls
  }
  return { lines: lines.length, owedIls: round2(owed), paidIls: round2(paid) }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
