/** Shared formatting for the account area. Hebrew locale, ILS, Israel timezone. */

import { type Agorot, agorot, formatAgorot, parseIls } from '@/lib/money'

/**
 * Format integer agorot as ₪ via money.ts.
 * Callers must pass Agorot (or a raw integer agorot count), never a float ILS.
 */
export function formatIls(value: Agorot | number): string {
  return formatAgorot(agorot(value))
}

/** Convert a legacy decimal ILS DB column into integer Agorot for display. */
export function ilsColumnToAgorot(value: number | string | null | undefined): Agorot {
  if (value == null || value === '') return agorot(0)
  if (typeof value === 'number') {
    return parseIls(value.toFixed(2))
  }
  return parseIls(value)
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
