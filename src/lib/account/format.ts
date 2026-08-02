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
  split_executed: 'שולמה',
  escrow_held: 'שולמה',
  escrow_released: 'הושלמה',
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

const COUPON_STATUS_LABELS: Record<string, string> = {
  issued: 'פעיל',
  active: 'פעיל',
  used: 'מומש',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'זוכה',
}

export function couponStatusLabel(status: string): string {
  return COUPON_STATUS_LABELS[status] ?? status
}

export function couponStatusTone(status: string): 'ok' | 'warn' | 'dead' {
  if (status === 'issued' || status === 'active') return 'ok'
  if (status === 'used' || status === 'redeemed') return 'warn'
  return 'dead'
}

export type CouponTab = 'active' | 'redeemed' | 'expired'

/** Map a voucher row onto the coupons-page tabs (פעיל / נסרק / פג תוקף). */
export function voucherTab(v: { status: string; expires_at: string }, now = Date.now()): CouponTab {
  if (v.status === 'redeemed' || v.status === 'used') return 'redeemed'
  if (v.status === 'expired' || v.status === 'cancelled' || v.status === 'refunded') {
    return 'expired'
  }
  if (v.status === 'issued' && new Date(v.expires_at).getTime() <= now) return 'expired'
  return 'active'
}

export function formatVoucherCode(code: string): string {
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5, 10)}` : code
}
