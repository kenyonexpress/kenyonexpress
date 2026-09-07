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
