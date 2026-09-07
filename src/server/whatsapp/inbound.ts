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

export type InboundIntent = 'opt_in' | 'opt_out' | 'message'

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

export function classifyInbound(body: string): InboundIntent {
  const normalized = body
    .trim()
    .toLowerCase()
    // Punctuation someone types around a keyword ("הסר!", "STOP.") is noise.
    .replace(/[.!?,;:'"״׳-]+$/u, '')
    .replace(/\s+/g, ' ')
  if (OPT_OUT_KEYWORDS.has(normalized)) return 'opt_out'
  if (OPT_IN_KEYWORDS.has(normalized)) return 'opt_in'
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
