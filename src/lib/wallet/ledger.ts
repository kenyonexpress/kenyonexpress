import { ilsColumnToAgorot } from '@/lib/account/format'
import { type Agorot, agorot } from '@/lib/money'

/**
 * One `v_wallet_ledger` row, as the account page reads it, in integer agorot.
 *
 * 260 appends `amount_agorot` / `signed_amount_agorot` (bigint, from the
 * generated `wallet_entries.amount_ils_agorot`). Before 260, and on any
 * database that never got it, only the decimal `*_ils` pair exists. The reader
 * selects the agorot pair first and falls back on 42703, so both shapes reach
 * this one function.
 *
 * An agorot value wins when it is present and integral. PostgREST sends bigint
 * as a JSON number; a string is accepted too, for a proxy that stringifies
 * large integers. A non-integral "agorot" value is not trusted and the shekel
 * column is parsed instead, which is exact (`ilsColumnToAgorot` parses, it does
 * not multiply).
 */
export const WALLET_LEDGER_SELECT_AGOROT =
  'id, direction, signed_amount_agorot, amount_agorot, signed_amount_ils, amount_ils, reason, order_id, created_at'

/** The pre-260 select. Kept for the 42703 fallback, never as the first read. */
export const WALLET_LEDGER_SELECT_ILS =
  'id, direction, signed_amount_ils, amount_ils, reason, order_id, created_at'

export interface WalletLedgerDbRow {
  id: string
  direction: string | null
  signed_amount_agorot?: number | string | null
  amount_agorot?: number | string | null
  signed_amount_ils?: number | string | null
  amount_ils?: number | string | null
  reason: string
  order_id: string | null
  created_at: string
}

export interface WalletLedgerEntry {
  id: string
  direction: 'credit' | 'debit'
  signedAmountAgorot: Agorot
  amountAgorot: Agorot
  reason: string
  orderId: string | null
  createdAt: string
}

function integralAgorot(value: number | string | null | undefined): Agorot | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(n) ? agorot(n) : null
}

export function ledgerRowToEntry(row: WalletLedgerDbRow): WalletLedgerEntry {
  const direction = row.direction === 'credit' ? 'credit' : 'debit'
  const amount = integralAgorot(row.amount_agorot) ?? ilsColumnToAgorot(row.amount_ils)
  const signed =
    integralAgorot(row.signed_amount_agorot) ??
    (row.signed_amount_ils != null && row.signed_amount_ils !== ''
      ? ilsColumnToAgorot(row.signed_amount_ils)
      : agorot(direction === 'credit' ? amount : -amount))
  return {
    id: row.id,
    direction,
    signedAmountAgorot: signed,
    amountAgorot: amount,
    reason: row.reason,
    orderId: row.order_id,
    createdAt: row.created_at,
  }
}

/** The net of a set of entries, an integer sum. Never a float on the way. */
export function ledgerNetAgorot(entries: readonly WalletLedgerEntry[]): Agorot {
  return agorot(entries.reduce((sum, e) => sum + e.signedAmountAgorot, 0))
}
