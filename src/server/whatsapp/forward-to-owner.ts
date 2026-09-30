import { contactEmail } from '@/lib/contact-address'
import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import {
  PUBLISHED_STORE_WHATSAPP,
  formatIsraeliPhoneDisplay,
  normalizeIsraeliPhone,
} from '@/lib/whatsapp'
import { supportForwardText } from '@/server/whatsapp/messages'
import { buildWhatsAppTemplate, contentSidFor } from '@/server/whatsapp/templates'
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/server/whatsapp/twilio'

/**
 * Customer-initiated support, routed to Ofir (STEP 17).
 *
 * The webhook files every free-text, refund and unanswerable status message
 * as a ticket; until now the ticket waited for someone to open the admin.
 * This forwards each one, the moment it lands, on two legs:
 *
 * 1. WHATSAPP TO THE OWNER'S OWN NUMBER. The store's published WhatsApp
 *    (`PUBLISHED_STORE_WHATSAPP`, the number on the floating button) is
 *    Ofir's phone; `SUPPORT_FORWARD_WHATSAPP_TO` overrides it. The message
 *    is the `support_inbound` template when its SID is approved, which
 *    delivers regardless of any window; before that, free text, which
 *    delivers only while Ofir's number has a service window open with the
 *    Twilio sender (writing to it once opens one, every reply keeps it
 *    open). A refused free-text send is logged and the email still goes.
 *
 * 2. EMAIL TO THE STORE INBOX, the same `CONTACT_TO` address the contact
 *    form uses. Reliable, no window, and a searchable record; the WhatsApp
 *    ping is what makes it prompt.
 *
 * NEVER THROWS, NEVER BLOCKS THE TICKET. The ticket row is already written
 * when this runs; a forwarding failure is a slower answer, not a lost one.
 * The result is reported so the webhook can log it.
 */

export interface ForwardInput {
  /** International digits, no plus: the customer's number. */
  phone: string
  ticketId: string
  body: string
  intent: string
}

export interface ForwardOutcome {
  whatsapp: 'sent' | 'skipped' | 'failed'
  email: 'sent' | 'skipped' | 'failed'
}

/** Where the owner's alert goes, as international digits. */
export function ownerForwardNumber(env: Partial<NodeJS.ProcessEnv> = process.env): string | null {
  return (
    normalizeIsraeliPhone(env.SUPPORT_FORWARD_WHATSAPP_TO) ??
    normalizeIsraeliPhone(PUBLISHED_STORE_WHATSAPP)
  )
}

/** Set `SUPPORT_FORWARD_WHATSAPP_TO=off` to silence the WhatsApp leg entirely. */
function whatsappLegDisabled(env: Partial<NodeJS.ProcessEnv>): boolean {
  return (env.SUPPORT_FORWARD_WHATSAPP_TO ?? '').trim().toLowerCase() === 'off'
}

export function ticketRef(ticketId: string): string {
  return ticketId.slice(0, 8).toUpperCase()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function forwardWhatsApp(
  input: ForwardInput,
  env: Partial<NodeJS.ProcessEnv>,
): Promise<ForwardOutcome['whatsapp']> {
  if (whatsappLegDisabled(env)) return 'skipped'
  const to = ownerForwardNumber(env)
  if (!to) return 'skipped'
  // Forwarding the customer's message back to the customer is not routing.
  if (to === input.phone) return 'skipped'

  const ref = ticketRef(input.ticketId)
  const payload = { phone: input.phone, ticket_ref: ref, body: input.body }

  const result = contentSidFor('support_inbound', env)
    ? await (async () => {
        const template = buildWhatsAppTemplate('support_inbound', payload, env)
        return template
          ? sendWhatsAppTemplate(to, template.contentSid, template.variables)
          : { ok: false as const, skipped: false as const, reason: 'template_unfilled' }
      })()
    : await sendWhatsAppMessage(
        to,
        supportForwardText({
          phoneDisplay: formatIsraeliPhoneDisplay(input.phone) ?? input.phone,
          ticketRef: ref,
          body: input.body,
          intent: input.intent,
        }),
      )

  if (result.ok) return 'sent'
  if (result.skipped) return 'skipped'
  log.warn('whatsapp.forward_to_owner_failed', { ticketId: input.ticketId, reason: result.reason })
  return 'failed'
}

async function forwardEmail(
  input: ForwardInput,
  env: Partial<NodeJS.ProcessEnv>,
): Promise<ForwardOutcome['email']> {
  const ref = ticketRef(input.ticketId)
  const phoneDisplay = formatIsraeliPhoneDisplay(input.phone) ?? input.phone
  const excerpt = input.body.trim() || '(הודעה ריקה)'
  const label =
    input.intent === 'refund_request'
      ? 'בקשת זיכוי'
      : input.intent === 'order_status'
        ? 'שאלת סטטוס הזמנה'
        : 'פנייה'
  const result = await sendEmail({
    to: contactEmail(env),
    subject: `וואטסאפ: ${label} ${ref} מ-${phoneDisplay}`,
    idempotencyKey: `wa-forward:${input.ticketId}:${input.body.length}:${input.body.slice(0, 40)}`,
    html: `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;text-align:right">
      <h1 style="font-size:18px;margin:0 0 12px">${label} חדשה בוואטסאפ</h1>
      <p style="margin:0 0 8px"><strong>טלפון:</strong> ${escapeHtml(phoneDisplay)}</p>
      <p style="margin:0 0 8px"><strong>פנייה:</strong> ${ref}</p>
      <p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(excerpt)}</p>
      <p style="margin:16px 0 0"><a href="/admin/support/${input.ticketId}">לתשובה בממשק הניהול</a></p>
    </div>`,
    text: `${label} חדשה בוואטסאפ\nטלפון: ${phoneDisplay}\nפנייה: ${ref}\n\n${excerpt}\n\nלתשובה: /admin/support/${input.ticketId}`,
  })
  if (result.ok) return 'sent'
  if (result.skipped) return 'skipped'
  log.warn('whatsapp.forward_email_failed', { ticketId: input.ticketId, reason: result.reason })
  return 'failed'
}

export async function forwardInboundToOwner(
  input: ForwardInput,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): Promise<ForwardOutcome> {
  const [whatsapp, email] = await Promise.all([
    forwardWhatsApp(input, env).catch((err: unknown) => {
      log.warn('whatsapp.forward_to_owner_failed', {
        ticketId: input.ticketId,
        reason: err instanceof Error ? err.message : 'unknown',
      })
      return 'failed' as const
    }),
    forwardEmail(input, env).catch((err: unknown) => {
      log.warn('whatsapp.forward_email_failed', {
        ticketId: input.ticketId,
        reason: err instanceof Error ? err.message : 'unknown',
      })
      return 'failed' as const
    }),
  ])
  return { whatsapp, email }
}
