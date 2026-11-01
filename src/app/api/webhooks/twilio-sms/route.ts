import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { OPT_IN_CONFIRMATION, OPT_OUT_CONFIRMATION, optOutIntentOf } from '@/lib/sms/opt-out'
import { priceToMicro, toCurrencyCode, toErrorCode, toSmsStatus } from '@/lib/sms/receipt'
import { toSmsAddress } from '@/lib/sms/twilio'
import { createAdminClient } from '@/lib/supabase/admin'
import { twilioSignatureValid } from '@/server/whatsapp/twilio'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Twilio's one webhook for SMS, carrying two unrelated things.
 *
 * A DELIVERY RECEIPT (`MessageStatus` + `MessageSid`) is how a message's real
 * fate becomes knowable at all: the POST that sent it answered `queued`, which
 * is not delivery, and `Price` is null until this arrives. Without this route
 * the log would say every message succeeded and the cost column would be empty
 * forever.
 *
 * AN INBOUND MESSAGE (`Body` + `From`) is almost always somebody asking to
 * stop. Twilio intercepts STOP, UNSUBSCRIBE and four other ENGLISH keywords and
 * blocks the number itself; an Israeli customer replies **הסר**, which Twilio
 * forwards here and does nothing about. So the opt-out that matters for this
 * audience is the one in this file.
 *
 * WHY BOTH IN ONE ROUTE. Twilio's console has one URL field per number for
 * incoming messages and one for status callbacks, and they are routinely set to
 * the same value by whoever is configuring it under time pressure. A route that
 * only handled one would answer 200 to the other and lose it silently. Telling
 * them apart is one field.
 *
 * AUTH: X-Twilio-Signature, HMAC-SHA1 over the public URL plus every POST
 * parameter sorted by name. The URL must be the one configured in the console,
 * which behind Vercel's proxy is NOT `request.url` -- so it is built from the
 * environment, exactly as the WhatsApp webhook does.
 *
 * IT ALWAYS ANSWERS 200 ONCE THE SIGNATURE PASSES. A non-2xx makes Twilio
 * retry, and a retry of a delivery receipt is a duplicate, not a repair.
 */

function publicWebhookUrl(): string {
  const explicit = process.env.TWILIO_SMS_WEBHOOK_URL
  if (explicit) return explicit
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(
    /\/+$/,
    '',
  )
  return `${site}/api/webhooks/twilio-sms`
}

/** TwiML, because an inbound message expects one and an empty one is valid. */
function twiml(message?: string): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
  return new NextResponse(body, {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  })
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Postgres undefined_table, and PostgREST's schema-cache equivalent. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    // No token means no way to verify the caller. Refusing is the only safe
    // answer: this endpoint writes opt-outs, and an unverified writer could
    // silence any customer's coupon codes.
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const rawBody = await request.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  if (
    !twilioSignatureValid(
      authToken,
      request.headers.get('x-twilio-signature'),
      publicWebhookUrl(),
      params,
    )
  ) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()

  // A status callback carries MessageStatus; an inbound message does not. That
  // one field is the whole disambiguation.
  const status = toSmsStatus(params.MessageStatus)
  if (params.MessageStatus) {
    if (!status) {
      // A status Twilio added that the CHECK constraint would refuse. Left
      // alone rather than written: a 23514 would lose the whole receipt,
      // including the price, which is the part that cannot be recovered.
      log.warn('sms.unknown_status', { status: params.MessageStatus })
      return twiml()
    }
    await recordReceipt(admin, params, status)
    return twiml()
  }

  return await handleInbound(admin, params)
}

async function recordReceipt(
  admin: ReturnType<typeof createAdminClient>,
  params: Record<string, string>,
  status: string,
): Promise<void> {
  const sid = params.MessageSid ?? params.SmsSid ?? ''
  if (!sid) return

  const priceMicro = priceToMicro(params.Price)
  const currency = toCurrencyCode(params.PriceUnit)

  const update: Record<string, unknown> = {
    status,
    error_code: toErrorCode(params.ErrorCode),
    error_message: params.ErrorMessage ? String(params.ErrorMessage).slice(0, 500) : null,
  }

  // Both or neither, because the table's CHECK says so and because a price
  // with no currency is a number nobody can add up.
  if (priceMicro !== null && currency !== null) {
    update.price_micro = priceMicro
    update.price_currency = currency
  }

  const { error } = await admin
    .from('sms_messages' as never)
    .update(update as never)
    .eq('provider_sid', sid)

  if (error && !MISSING_TABLE.has(error.code ?? '')) {
    log.warn('sms.receipt_write_failed', { reason: error.message, sid })
  }
}

async function handleInbound(
  admin: ReturnType<typeof createAdminClient>,
  params: Record<string, string>,
): Promise<NextResponse> {
  const from = toSmsAddress(params.From)
  const body = params.Body ?? ''

  // Signed but unusable: a number that is not an Israeli mobile, or a callback
  // shape this route does not know. Acknowledged so Twilio stops retrying.
  if (!from) return twiml()

  const intent = optOutIntentOf(body)
  if (!intent) {
    // A real message from a customer. SMS is not a support channel here --
    // nothing is watching it -- so the honest answer is silence rather than an
    // auto-reply promising an answer nobody will send.
    log.info('sms.inbound_ignored', { from_host: 'il-mobile' })
    return twiml()
  }

  if (intent === 'stop') {
    const { error } = await admin.from('sms_opt_outs' as never).upsert(
      {
        to_e164: from,
        keyword: body.trim().slice(0, 40),
        // Explicitly cleared: a number that opted out, resumed, and opted out
        // again must end opted out, and an upsert that left the old
        // `resumed_at` in place would leave it subscribed.
        resumed_at: null,
      } as never,
      { onConflict: 'to_e164' },
    )
    if (error && !MISSING_TABLE.has(error.code ?? '')) {
      log.error('sms.opt_out_write_failed', { reason: error.message })
      // The one case worth a non-200: if the opt-out was not recorded, a retry
      // is a repair rather than a duplicate, and continuing to message somebody
      // who said stop is the failure this whole file exists to prevent.
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    // The confirmation rides the TwiML response rather than a second API call:
    // one fewer message to bill, and it cannot fail separately.
    return twiml(OPT_OUT_CONFIRMATION)
  }

  const { error } = await admin
    .from('sms_opt_outs' as never)
    .update({ resumed_at: new Date().toISOString() } as never)
    .eq('to_e164', from)

  if (error && !MISSING_TABLE.has(error.code ?? '')) {
    log.warn('sms.opt_in_write_failed', { reason: error.message })
  }
  return twiml(OPT_IN_CONFIRMATION)
}

export const POST = withRequestLog('/api/webhooks/twilio-sms', handlePOST)
