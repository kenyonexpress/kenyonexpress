import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildWhatsAppText } from '@/server/whatsapp/messages'
import { serviceWindowOpen } from '@/server/whatsapp/service-window'
import { buildWhatsAppTemplate, contentSidFor, templateSpec } from '@/server/whatsapp/templates'
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/server/whatsapp/twilio'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Drains `whatsapp_outbox` (migration 173) through Twilio.
 *
 * Same architecture as /api/cron/notifications, single leg: the triggers
 * decide WHETHER a message is owed, in-transaction; this decides only WHEN it
 * goes out. Retries back off exponentially and park as `dead` after five, a
 * state an admin can see and requeue rather than a silent drop.
 *
 * CONSENT IS RE-CHECKED AT SEND TIME. fn_enqueue_whatsapp already refused
 * phones that were not opted in, but an opt-out that lands between enqueue and
 * drain must still win: the row settles as `skipped` and nothing is sent.
 *
 * A missing Twilio credential is `skipped`-in-place, not an attempt: rows wait
 * untouched, exactly like the mail queue on a machine with no RESEND_API_KEY,
 * so the backlog drains itself once the credential exists.
 *
 * TEMPLATE FIRST, FREE TEXT ONLY INSIDE THE WINDOW (STEP 17). WhatsApp
 * delivers free text only within 24 hours of the customer's last message to
 * us; everything else must be a Meta-approved Content Template. So each row
 * goes out as its template when the kind's ContentSid is configured
 * (`templates.ts`), as free text when it is not but the customer wrote to us
 * in the last 24 hours (`service-window.ts`), and otherwise WAITS: the row
 * stays pending, burns no attempt, names the missing env var in
 * `last_error`, and is looked at again in an hour. Sending the free text
 * anyway would be refused by Twilio (63016) and would count as a failure
 * against a row that did nothing wrong.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

const BATCH = 50

const MAX_ATTEMPTS = 5

/** 2, 8, 32, 128 minutes. Same curve as the mail drain. */
function backoffMinutes(attempts: number): number {
  return 2 * 4 ** Math.max(0, attempts - 1)
}

/** How long a row waits for its template before the drain looks again. */
const AWAITING_TEMPLATE_MINUTES = 60

type WhatsAppOutboxRow = {
  id: string
  kind: string
  phone: string
  payload: Record<string, unknown> | null
  dedupe_key: string
  attempts: number
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from('whatsapp_outbox')
    .select('id, kind, phone, payload, dedupe_key, attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', now)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) {
    log.error('whatsapp.outbox_read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as WhatsAppOutboxRow[]
  let sent = 0
  let skipped = 0
  let optedOut = 0
  let failed = 0
  let dead = 0
  let awaitingTemplate = 0

  for (const row of rows) {
    const { data: contact, error: contactError } = await admin
      .from('whatsapp_contacts')
      .select('status')
      .eq('phone', row.phone)
      .maybeSingle()

    // A failed consent read is not an opt-out. `skipped` is terminal, so
    // marking it here would drop a legitimate notification over a transient
    // error; the row stays pending and the next run reads again.
    if (contactError) {
      failed++
      log.error('whatsapp.consent_read_failed', { reason: contactError.message })
      continue
    }

    if ((contact as { status: string } | null)?.status !== 'opted_in') {
      optedOut++
      await admin
        .from('whatsapp_outbox')
        .update({ status: 'skipped', last_error: 'not opted in at send time' })
        .eq('id', row.id)
      continue
    }

    const payload = row.payload ?? {}
    const text = buildWhatsAppText(row.kind, payload)
    const spec = templateSpec(row.kind)
    if (!text && !spec) {
      // A kind nothing can render will never render, however often it is
      // retried, so it is parked immediately rather than burning five attempts.
      dead++
      await admin
        .from('whatsapp_outbox')
        .update({ status: 'dead', last_error: `no template for kind ${row.kind}` })
        .eq('id', row.id)
      continue
    }

    const template = buildWhatsAppTemplate(row.kind, payload)
    let result: Awaited<ReturnType<typeof sendWhatsAppMessage>>

    if (template) {
      result = await sendWhatsAppTemplate(row.phone, template.contentSid, template.variables)
    } else if (spec && contentSidFor(row.kind) && !text) {
      // The SID is configured but the payload cannot fill it (no order ref):
      // retrying will not grow a ref, so this is the same dead as above.
      dead++
      await admin
        .from('whatsapp_outbox')
        .update({ status: 'dead', last_error: `payload cannot fill template ${row.kind}` })
        .eq('id', row.id)
      continue
    } else if (text && (await serviceWindowOpen(admin, row.phone))) {
      result = await sendWhatsAppMessage(row.phone, text)
    } else {
      // No approved template and no open window: waiting is the only send
      // that will ever succeed. Not an attempt, not a failure.
      awaitingTemplate++
      await admin
        .from('whatsapp_outbox')
        .update({
          status: 'pending',
          last_error: `awaiting approved template (${spec?.envVar ?? row.kind}); no open 24h window`,
          next_attempt_at: new Date(Date.now() + AWAITING_TEMPLATE_MINUTES * 60_000).toISOString(),
        })
        .eq('id', row.id)
      continue
    }

    if (result.ok) {
      sent++
      await admin
        .from('whatsapp_outbox')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          attempts: row.attempts + 1,
          last_error: null,
        })
        .eq('id', row.id)
      continue
    }

    if (result.skipped) {
      // No credential is not a failure of this row; see the header.
      skipped++
      continue
    }

    const attempts = row.attempts + 1
    const isDead = attempts >= MAX_ATTEMPTS
    if (isDead) dead++
    else failed++

    await admin
      .from('whatsapp_outbox')
      .update({
        status: isDead ? 'dead' : 'pending',
        attempts,
        last_error: result.reason.slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
      })
      .eq('id', row.id)
  }

  return NextResponse.json({
    ok: true,
    considered: rows.length,
    sent,
    skipped,
    optedOut,
    failed,
    dead,
    awaitingTemplate,
  })
}

export const GET = withRequestLog('/api/cron/whatsapp', handleGET)
