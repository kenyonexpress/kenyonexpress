/** Shared formatting for the account area. Hebrew locale, ILS, Israel timezone. */

import { type Agorot, agorot, formatAgorot, parseIls } from '@/lib/money'

/**
 * Render integer agorot as shekels, through money.ts and nothing else.
 *
 * This used to be `₪${value.toFixed(2)}` over a float, and the whole account
 * area fed it floats: `getWalletSummary` returned `balanceAgorot / 100` and the
 * ledger returned `Number(row.amount_ils)`. So the one screen that shows a
 * customer their own money was the one place in the app doing float money math,
 * against a project rule that says otherwise.
 *
 * The parameter is branded, so a caller holding shekels cannot reach this
 * function without saying so: it has to go through `ilsColumnToAgorot` first,
 * and that conversion parses the decimal rather than multiplying it.
 */
export function formatIls(value: Agorot): string {
  return formatAgorot(value)
}

/**
 * A legacy decimal `*_ils` column, read as integer agorot.
 *
 * Parses rather than multiplies. `Number('8.20') * 100` is 819.9999999999999,
 * and while Math.round rescues most two-decimal values it also silently accepts
 * a third decimal and NaN. `parseIls` refuses both.
 */
export function ilsColumnToAgorot(value: number | string | null | undefined): Agorot {
  if (value == null || value === '') return agorot(0)
  return parseIls(typeof value === 'number' ? value.toFixed(2) : value)
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'לא זמין'
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date(iso))
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'לא זמין'
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date(iso))
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתינה לתשלום',
  paid: 'שולמה',
  split_executed: 'הושלמה',
  redeemed: 'מומשה',
  refunded: 'זוכתה',
  cancelled: 'בוטלה',
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status
}

export function orderStatusTone(status: string): 'ok' | 'warn' | 'dead' {
  if (status === 'cancelled' || status === 'refunded') return 'dead'
  if (status === 'pending') return 'warn'
  return 'ok'
}

/**
 * Coupon status used to be presented from here too, with its own label table.
 * It answered from the stored column, so a coupon past its deadline read `פעיל`
 * until the expiry sweep ran, and it had no entry for `cancelled` at all, which
 * put the literal string `cancelled` in front of a Hebrew reader. Both screens
 * that used it now go through `lib/vouchers/coupon-view.ts`, which answers from
 * the clock and is the same module the counter uses.
 */
