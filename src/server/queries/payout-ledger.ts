import 'server-only'

import { LEDGER_MAX_ROWS, type LedgerLine } from '@/lib/admin/payout-ledger'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

export type LedgerRead =
  | { failed: false; lines: LedgerLine[]; truncated: boolean }
  | { failed: true; reason: string }

type LineRow = {
  line_type: string
  description: string | null
  order_item_id: string | null
  quantity: number
  gross_ils: number | string
  platform_fee_ils: number | string
  payout_ils: number | string
  created_at: string
  available_at: string | null
  payout_statements:
    | {
        statement_number: string
        status: string
        rolled_over: boolean | null
        period_start: string
        period_end: string
        deleted_at: string | null
      }
    | {
        statement_number: string
        status: string
        rolled_over: boolean | null
        period_start: string
        period_end: string
        deleted_at: string | null
      }[]
    | null
}

/**
 * Every line on every statement of one supplier, newest statement first.
 *
 * Read on the caller's own session, not the service key: `payout_lines: admin
 * all` and `payout_statements: admin all` are the policies, so an admin sees
 * everything and anyone else sees nothing, and the route guard above this is
 * defence in depth rather than the only gate.
 */
export async function readSupplierLedger(supplierId: string): Promise<LedgerRead> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payout_statement_lines')
    .select(
      `line_type, description, order_item_id, quantity, gross_ils, platform_fee_ils, payout_ils,
       created_at, available_at,
       payout_statements!inner(statement_number, status, rolled_over, period_start, period_end, deleted_at)`,
    )
    .eq('payout_statements.supplier_id', supplierId)
    .is('payout_statements.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LEDGER_MAX_ROWS + 1)

  if (error) {
    log.warn('payout_ledger.read_failed', { supplierId, reason: error.message })
    return { failed: true, reason: error.message }
  }

  const rows = (data ?? []) as LineRow[]
  const lines: LedgerLine[] = rows.slice(0, LEDGER_MAX_ROWS).flatMap((row) => {
    const statement = Array.isArray(row.payout_statements)
      ? row.payout_statements[0]
      : row.payout_statements
    if (!statement) return []
    return [
      {
        statementNumber: statement.statement_number,
        statementStatus: statement.status,
        rolledOver: statement.rolled_over ?? false,
        periodStart: statement.period_start,
        periodEnd: statement.period_end,
        lineType: row.line_type,
        description: row.description,
        orderItemId: row.order_item_id,
        quantity: Number(row.quantity ?? 0),
        grossIls: Number(row.gross_ils ?? 0),
        platformFeeIls: Number(row.platform_fee_ils ?? 0),
        payoutIls: Number(row.payout_ils ?? 0),
        createdAt: row.created_at,
        availableAt: row.available_at,
      },
    ]
  })

  return { failed: false, lines, truncated: rows.length > LEDGER_MAX_ROWS }
}
