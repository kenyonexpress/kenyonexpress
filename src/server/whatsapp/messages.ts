import { formatAgorot } from '@/lib/vouchers/coupon-view'

/**
 * WhatsApp message builders: pure text, no transport, no database, same split
 * as lib/email/notifications.ts and for the same reason: what a customer reads
 * can be tested directly.
 *
 * Money arrives in agorot in every payload and only formatAgorot renders it.
 * Nothing here divides by 100.
 *
 * Every notification ends with the opt-out line. WhatsApp business policy
 * requires an always-available exit, and a customer who forgot they opted in
 * gets the way out in the same message that surprised them.
 */

/** The kinds the outbox CHECK in migration 173 accepts. Keep the two in step. */
export type WhatsAppOutboxKind =
  | 'order_paid'
  | 'order_fulfilled'
  | 'order_cancelled'
  | 'order_refunded'

const OPT_OUT_HINT = 'להסרה מעדכוני וואטסאפ השיבו: הסר'

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function greeting(payload: Record<string, unknown>): string {
  const name = asText(payload.customer_name)
  return name ? `שלום ${name},` : 'שלום,'
}

function orderRef(payload: Record<string, unknown>): string {
  return (
    asText(payload.order_ref) ??
    String(payload.order_id ?? '')
      .slice(0, 8)
      .toUpperCase()
  )
}

/**
 * One notification text per queued kind. Unknown kinds return null so the
 * drain can park the row instead of sending a blank.
 */
export function buildWhatsAppText(kind: string, payload: Record<string, unknown>): string | null {
  const ref = orderRef(payload)
  if (!ref) return null

  const total = asNumber(payload.total_agorot)
  const totalLine = total > 0 ? `סך ההזמנה: ${formatAgorot(total)}` : ''

  switch (kind as WhatsAppOutboxKind) {
    case 'order_paid': {
      const lines = [greeting(payload), `התשלום התקבל והזמנה ${ref} נקלטה.`]
      if (totalLine) lines.push(totalLine)
      lines.push('', OPT_OUT_HINT)
      return lines.join('\n')
    }

    case 'order_fulfilled':
      return [greeting(payload), `הזמנה ${ref} טופלה וסופקה במלואה.`, '', OPT_OUT_HINT].join('\n')

    case 'order_cancelled':
      return [greeting(payload), `הזמנה ${ref} בוטלה.`, '', OPT_OUT_HINT].join('\n')

    case 'order_refunded':
      // No date promise: the credit is at the card issuer's pace, and a named
      // day generates a support ticket on that day (same rule as the email).
      return [
        greeting(payload),
        `בוצע זיכוי על הזמנה ${ref}. ההופעה בדף החשבון תלויה בחברת האשראי.`,
        '',
        OPT_OUT_HINT,
      ].join('\n')

    default:
      return null
  }
}

/** Confirmation after an opt-out keyword. The last message this number gets. */
export const OPT_OUT_REPLY = 'הוסרתם מעדכוני וואטסאפ של KenyonExpress. כדי לחזור, השיבו: הצטרפות'

/** Confirmation after an opt-in keyword. */
export const OPT_IN_REPLY =
  'נרשמתם לעדכוני וואטסאפ של KenyonExpress. נעדכן כאן על סטטוס ההזמנות שלכם. להסרה השיבו: הסר'

/** Acknowledgment for a free-text message that opened or joined a ticket. */
export function ticketAckText(ticketRef: string): string {
  return `קיבלנו את פנייתך (מספר פנייה ${ticketRef}) ונחזור אליך בהקדם. אפשר להוסיף פרטים בהודעה נוספת כאן.`
}

/**
 * Customer-facing Hebrew for every order_status value production knows.
 * platform_settled is an internal accounting state; the customer's goods
 * arrived, so it reads as fulfilled.
 */
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתינה לתשלום',
  paid: 'שולמה ובטיפול',
  partially_fulfilled: 'סופקה חלקית',
  fulfilled: 'סופקה',
  cancelled: 'בוטלה',
  refunded: 'זוכתה',
  platform_settled: 'סופקה',
}

export interface OrderStatusRow {
  order_ref: string
  status: string
  total_agorot: number
  created_at: string
}

/** The reply to a status question: the customer's recent orders, newest first. */
export function orderStatusText(orders: OrderStatusRow[]): string {
  const lines = [orders.length === 1 ? 'סטטוס ההזמנה שלך:' : 'ההזמנות האחרונות שלך:']
  for (const order of orders) {
    const label = ORDER_STATUS_LABELS[order.status] ?? order.status
    const date = new Date(order.created_at)
    const when = Number.isNaN(date.getTime())
      ? ''
      : ` מ-${date.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`
    const total = order.total_agorot > 0 ? `, ${formatAgorot(order.total_agorot)}` : ''
    lines.push(`הזמנה ${order.order_ref}${when}: ${label}${total}`)
  }
  lines.push('', 'לשאלה נוספת אפשר פשוט לכתוב לנו כאן.')
  return lines.join('\n')
}

/** A status question from a phone no order is attached to. */
export const NO_ORDERS_TEXT = [
  'לא מצאנו הזמנות המשויכות למספר הזה.',
  'אם הזמנתם עם מספר טלפון אחר, כתבו לנו כאן את מספר ההזמנה ונבדוק.',
].join('\n')

/** Subject prefix that marks a ticket as a refund request for the admin queue. */
export const REFUND_SUBJECT_PREFIX = 'בקשת זיכוי'

/** Acknowledgment for a refund request that opened or joined a ticket. */
export function refundRequestAckText(ticketRef: string): string {
  return [
    `קיבלנו את בקשת הזיכוי שלך (מספר פנייה ${ticketRef}) והיא תיבדק בהקדם.`,
    'אם לא ציינתם מספר הזמנה, כתבו אותו כאן בהודעה נוספת כדי לזרז את הטיפול.',
  ].join('\n')
}
