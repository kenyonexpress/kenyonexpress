/** Shared formatting for the account area. Hebrew locale, ILS, Israel timezone. */

export function formatIls(value: number): string {
  return `₪${value.toFixed(2)}`
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
