import { normalizeIsraeliPhone } from '@/lib/whatsapp'

/**
 * Classification of what a customer typed at us on WhatsApp.
 *
 * KEYWORDS MATCH THE WHOLE MESSAGE, not a substring. "I want to stop my order"
 * is a support request, and treating it as an opt-out would silently cut off
 * the person mid-conversation; the false negative (a keyword inside a
 * sentence stays a ticket) costs one human read, the false positive costs the
 * channel. Twilio additionally enforces the English STOP/START pair at the
 * platform level before we ever see it, so this list is the Hebrew layer.
 */

export type InboundIntent = 'opt_in' | 'opt_out' | 'order_status' | 'refund_request' | 'message'

const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'הסר',
  'הסרה',
  'להסיר',
  'הסירו אותי',
  'תסירו אותי',
])

const OPT_IN_KEYWORDS = new Set([
  'start',
  'unstop',
  'join',
  'yes',
  'הצטרפות',
  'הצטרף',
  'הרשמה',
  'צרפו אותי',
  'אישור',
])

/**
 * Self-service intents, same whole-message rule. A missed phrasing costs one
 * human read of a ticket; a wrong match here answers a support question with
 * an order list, so the sets stay short and literal. Bare "ביטול" is in
 * neither set on purpose: over WhatsApp it is ambiguous between cancelling an
 * order and unsubscribing, and both wrong guesses are bad, so it reaches a
 * human as a ticket.
 */
const ORDER_STATUS_KEYWORDS = new Set([
  'status',
  'order status',
  'סטטוס',
  'סטאטוס',
  'סטטוס הזמנה',
  'מצב הזמנה',
  'מצב ההזמנה',
  'איפה ההזמנה',
  'איפה ההזמנה שלי',
  'מה עם ההזמנה',
  'מה עם ההזמנה שלי',
  'מה קורה עם ההזמנה שלי',
])

const REFUND_KEYWORDS = new Set([
  'refund',
  'זיכוי',
  'החזר',
  'החזר כספי',
  'בקשת זיכוי',
  'בקשת החזר',
  'אני רוצה זיכוי',
  'אני רוצה החזר',
  'ביטול הזמנה',
  'לבטל הזמנה',
  'לבטל את ההזמנה',
])

export function classifyInbound(body: string): InboundIntent {
  const normalized = body
    .trim()
    .toLowerCase()
    // Punctuation someone types around a keyword ("הסר!", "STOP.") is noise.
    .replace(/[.!?,;:'"״׳-]+$/u, '')
    .replace(/\s+/g, ' ')
  if (OPT_OUT_KEYWORDS.has(normalized)) return 'opt_out'
  if (OPT_IN_KEYWORDS.has(normalized)) return 'opt_in'
  if (ORDER_STATUS_KEYWORDS.has(normalized)) return 'order_status'
  if (REFUND_KEYWORDS.has(normalized)) return 'refund_request'
  return 'message'
}

/**
 * Twilio's `From` is `whatsapp:+972501234567`. Returns the same international
 * digits shape the rest of the flow keys on ("972501234567"), or null.
 */
export function waPhoneDigits(from: string): string | null {
  const withoutScheme = from.replace(/^whatsapp:/i, '')
  return normalizeIsraeliPhone(withoutScheme)
}
