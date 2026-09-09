import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyInbound, waPhoneDigits } from '@/server/whatsapp/inbound'
import {
  NO_ORDERS_TEXT,
  OPT_IN_REPLY,
  OPT_OUT_REPLY,
  type OrderStatusRow,
  REFUND_SUBJECT_PREFIX,
  orderStatusText,
  refundRequestAckText,
  ticketAckText,
} from '@/server/whatsapp/messages'
import { loadTwilioEnv, twilioSignatureValid } from '@/server/whatsapp/twilio'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Receiver for Twilio's WhatsApp inbound webhook.
 *
 * Auth: X-Twilio-Signature, Twilio's HMAC-SHA1 over the public URL plus the
 * sorted form params, keyed with the auth token. Without TWILIO_* configured
 * the route answers 401 to everything: an unconfigured deploy is a closed one,
 * the same stance as CRON_SECRET on the cron routes.
 *
 * What a message does, decided by classifyInbound:
 * - opt-out keyword: the consent row goes opted_out and the reply confirms.
 * - opt-in keyword: opted_in, reply confirms. This is the only self-service
 *   way consent is ever granted; nothing opts a phone in on its behalf.
 * - order-status keyword: the reply lists the phone's recent orders, looked up
 *   through fn_wa_orders_for_phone (migration 211). While that function is not
 *   applied, or when the lookup fails, the question files as a ticket so a
 *   human answers it instead of the customer getting silence. Consent is not
 *   required: the customer asked us, this is not a proactive notification.
 * - refund keyword: a ticket whose subject carries REFUND_SUBJECT_PREFIX, the
 *   marker the admin queue (and 211's category backfill) filters on, and the
 *   reply confirms the request and asks for the order number.
 * - anything else: a support ticket. An open ticket for the same phone absorbs
 *   the message; otherwise one is created, and the reply carries its ref.
 *
 * ORDERING: replay check first (read), then the side effects, then the
 * inbound row is recorded (write). A failure mid-processing therefore returns
 * 500 with no record, and Twilio's retry starts clean. The cost is that two
 * concurrent deliveries of the same SID could both process; for opt-in/out
 * that is idempotent, and for tickets the open-ticket lookup makes the second
 * message land in the ticket the first one opened.
 *
 * Replies are TwiML: Twilio turns the <Message> body into the WhatsApp reply,
 * so answering costs no extra API call and works before TWILIO_WHATSAPP_FROM
 * can send anything proactively.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function twiml(message?: string): NextResponse {
  const body = message ? `<Message>${escapeXml(message)}</Message>` : ''
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  })
}

/** The URL Twilio signs is the one in its console, not request.url: Vercel's
 *  proxy rewrites the host, so the configured value wins when present. */
function publicWebhookUrl(): string {
  const explicit = process.env.TWILIO_WEBHOOK_URL
  if (explicit) return explicit
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(
    /\/+$/,
    '',
  )
  return `${site}/api/webhooks/whatsapp`
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Attaches a message to the phone's open ticket, or opens one. Shared by the
 * free-text and refund paths, and by the status path when the lookup fails.
 * `subject` only matters when a new ticket is opened; a message that joins an
 * existing ticket keeps that ticket's subject, so a refund request landing in
 * an open conversation is flagged by its body, not the subject line.
 */
async function fileTicketMessage(
  admin: AdminClient,
  phone: string,
  body: string,
  messageSid: string,
  subject: string,
): Promise<{ ok: true; ticketId: string } | { ok: false }> {
  // The contact row is only touched when the phone is new; an existing status
  // (either consent decision) must survive a support conversation.
  await admin
    .from('whatsapp_contacts')
    .upsert({ phone, status: 'pending', source: 'inbound_message' } as never, {
      onConflict: 'phone',
      ignoreDuplicates: true,
    })

  const { data: openTicket, error: lookupError } = await admin
    .from('support_tickets')
    .select('id')
    .eq('phone', phone)
    .in('status', ['open', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // A failed lookup must not quietly open a second ticket for a phone that
  // already has one; the caller's 500 hands the message back to Twilio's retry.
  if (lookupError) {
    log.error('whatsapp.ticket_lookup_failed', { reason: lookupError.message })
    return { ok: false }
  }

  let ticketId = (openTicket as { id: string } | null)?.id ?? null

  if (!ticketId) {
    const { data: created, error: createError } = await admin
      .from('support_tickets')
      .insert({ phone, channel: 'whatsapp', subject } as never)
      .select('id')
      .single()
    if (createError || !created) {
      log.error('whatsapp.ticket_create_failed', { reason: createError?.message })
      return { ok: false }
    }
    ticketId = (created as { id: string }).id
  }

  const { error: messageError } = await admin.from('support_ticket_messages').insert({
    ticket_id: ticketId,
    direction: 'inbound',
    body: body.slice(0, 4000),
    message_sid: messageSid,
  } as never)
  if (messageError) {
    log.error('whatsapp.ticket_message_failed', { reason: messageError.message })
    return { ok: false }
  }

  return { ok: true, ticketId }
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const env = loadTwilioEnv()
  if (!env) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const rawBody = await request.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  if (
    !twilioSignatureValid(
      env.authToken,
      request.headers.get('x-twilio-signature'),
      publicWebhookUrl(),
      params,
    )
  ) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const messageSid = params.MessageSid ?? ''
  const phone = waPhoneDigits(params.From ?? '')
  const body = (params.Body ?? '').trim()

  // Signed but unusable (a status callback, a non-Israeli number): acknowledge
  // so Twilio stops retrying; there is nothing to act on.
  if (!messageSid || !phone) {
    return twiml()
  }

  const admin = createAdminClient()

  const { data: seen, error: seenError } = await admin
    .from('whatsapp_inbound_messages')
    .select('message_sid')
    .eq('message_sid', messageSid)
    .maybeSingle()

  if (seenError) {
    log.error('whatsapp.inbound_replay_check_failed', { reason: seenError.message })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  if (seen) {
    // A delivery Twilio already made; the first one answered.
    return twiml()
  }

  const intent = classifyInbound(body)
  let ticketId: string | null = null
  let reply: string

  if (intent === 'opt_out') {
    const { error } = await admin.from('whatsapp_contacts').upsert(
      {
        phone,
        status: 'opted_out',
        opted_out_at: new Date().toISOString(),
        source: 'inbound_message',
      } as never,
      { onConflict: 'phone' },
    )
    if (error) {
      log.error('whatsapp.opt_out_failed', { reason: error.message })
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    reply = OPT_OUT_REPLY
  } else if (intent === 'opt_in') {
    const { error } = await admin.from('whatsapp_contacts').upsert(
      {
        phone,
        status: 'opted_in',
        opted_in_at: new Date().toISOString(),
        source: 'inbound_message',
      } as never,
      { onConflict: 'phone' },
    )
    if (error) {
      log.error('whatsapp.opt_in_failed', { reason: error.message })
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    reply = OPT_IN_REPLY
  } else if (intent === 'order_status') {
    const lookup = await admin.rpc('fn_wa_orders_for_phone' as never, { p_phone: phone } as never)

    if (lookup.error) {
      // The function is pending (migration 211) or the read failed. Either
      // way the customer asked a question; a ticket gets it answered by a
      // human rather than met with silence.
      const filed = await fileTicketMessage(
        admin,
        phone,
        body,
        messageSid,
        body.slice(0, 80) || 'שאלת סטטוס הזמנה',
      )
      if (!filed.ok) {
        return NextResponse.json({ ok: false }, { status: 500 })
      }
      ticketId = filed.ticketId
      reply = ticketAckText(ticketId.slice(0, 8).toUpperCase())
    } else {
      const orders = (lookup.data ?? []) as unknown as OrderStatusRow[]
      reply = orders.length > 0 ? orderStatusText(orders) : NO_ORDERS_TEXT
    }
  } else if (intent === 'refund_request') {
    const filed = await fileTicketMessage(
      admin,
      phone,
      body,
      messageSid,
      `${REFUND_SUBJECT_PREFIX}: ${body.slice(0, 60)}`,
    )
    if (!filed.ok) {
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    ticketId = filed.ticketId
    reply = refundRequestAckText(ticketId.slice(0, 8).toUpperCase())
  } else {
    const filed = await fileTicketMessage(
      admin,
      phone,
      body,
      messageSid,
      body.slice(0, 80) || 'פנייה בוואטסאפ',
    )
    if (!filed.ok) {
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    ticketId = filed.ticketId
    reply = ticketAckText(ticketId.slice(0, 8).toUpperCase())
  }

  // Best effort from here: the side effects landed, so the reply goes out even
  // if the audit row does not. A duplicate delivery in that window re-runs an
  // idempotent path.
  const auditRow = {
    message_sid: messageSid,
    phone,
    body: body.slice(0, 4000),
    intent,
    ticket_id: ticketId,
  }
  let { error: recordError } = await admin
    .from('whatsapp_inbound_messages')
    .insert(auditRow as never)
  if (recordError && (intent === 'order_status' || intent === 'refund_request')) {
    // Until migration 211 widens the intent CHECK, the new intents violate it.
    // Falling back to 'message' keeps the replay protection this row provides;
    // losing the intent label is the cheaper loss.
    ;({ error: recordError } = await admin
      .from('whatsapp_inbound_messages')
      .insert({ ...auditRow, intent: 'message' } as never))
  }
  if (recordError) {
    log.error('whatsapp.inbound_record_failed', { reason: recordError.message })
  }

  return twiml(reply)
}

export const POST = withRequestLog('/api/webhooks/whatsapp', handlePOST)
