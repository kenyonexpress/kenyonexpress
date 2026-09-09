import { buildNotification } from '@/lib/email/notifications'
import { sendEmail } from '@/lib/email/resend'
import { buildInAppContent, isInAppKind } from '@/lib/notifications/in-app'
import { loadPreferenceRows } from '@/lib/notifications/preference-store'
import { mayNotify } from '@/lib/notifications/preferences'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { pushOutboxRow } from '@/lib/push/dispatch'
import { bearerMatches } from '@/lib/security/constant-time'
import { sendOutboxSms } from '@/lib/sms/outbox'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboxWhatsapp } from '@/lib/whatsapp/outbox'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Drains `notification_outbox` through Resend AND through Expo push.
 *
 * TWO TRANSPORTS, ONE QUEUE (114). A row carries one logical notification and
 * two independent delivery legs, each with its own status, attempt counter and
 * backoff. That is why the query below asks for rows whose EITHER leg is due
 * rather than `status = 'pending'`: mail that went out on the first run must
 * not strand a push that had not been attempted yet, and a phone that is
 * unreachable must never cause a second copy of the email.
 *
 * Only three kinds ever produce a push, and `lib/push/templates.ts` is the gate
 * that decides. A kind with no push template settles as `push_status = 'none'`
 * on the first look and is never reconsidered.
 *
 * The queue is filled in-transaction by the triggers in 095: the customer's
 * order confirmation, one sale alert per supplier, and the coupon-scanned
 * notice. Nothing here decides WHETHER an email is owed; the database already
 * did, at the moment of the event. This decides only when it goes out.
 *
 * WHY A CRON AND NOT AN EDGE FUNCTION. The goal named a Supabase trigger plus
 * an edge function. The trigger half is real and applied. The edge-function
 * half would need `pg_net` to make the call from Postgres, and that extension
 * is not installed on this project (available, `installed_version` null).
 * Installing an extension on production to gain a second delivery mechanism,
 * when a cron route with the service role already runs nightly for the voucher
 * sweep, buys nothing this queue does not already have. The durability the
 * design actually wanted comes from the outbox row, not from the transport.
 *
 * RETRIES. A send that fails is not lost and not retried immediately: attempts
 * are counted, the row is pushed out by an exponential backoff, and after five
 * it goes `dead` and stops. `dead` is a state an admin can see and requeue; it
 * is not a silent drop.
 *
 * IDEMPOTENCY. `dedupe_key` is unique in the table AND is what Resend is given
 * as its idempotency key, so the same logical email cannot be sent twice even
 * if this route runs twice over the same row.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

/** One run's ceiling. A backlog drains over consecutive runs, as 068 does. */
const BATCH = 50

/** Attempts before a row is parked as dead rather than retried forever. */
const MAX_ATTEMPTS = 5

/** 2, 8, 32, 128 minutes. Long enough for a provider outage to end. */
function backoffMinutes(attempts: number): number {
  return 2 * 4 ** Math.max(0, attempts - 1)
}

type OutboxRow = {
  id: string
  kind: string
  recipient_email: string
  payload: Record<string, unknown> | null
  dedupe_key: string
  attempts: number
  /** Added by 114. Null on rows queued for an address with no account. */
  user_id: string | null
  status: string
  next_attempt_at: string
  push_status: string
  push_attempts: number
  push_next_attempt_at: string
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'

  const now = new Date().toISOString()

  // Either leg being due is enough to pick the row up. Selecting on the email
  // leg alone, as this did before 114, would strand every row whose mail went
  // out on the first run and whose push had not yet been attempted.
  const { data, error } = await admin
    .from('notification_outbox')
    .select(
      'id, kind, recipient_email, payload, dedupe_key, attempts, user_id, status, next_attempt_at, push_status, push_attempts, push_next_attempt_at',
    )
    .or(
      `and(status.eq.pending,next_attempt_at.lte.${now}),and(push_status.eq.pending,push_next_attempt_at.lte.${now})`,
    )
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) {
    log.error('notifications.outbox_read_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as OutboxRow[]
  let sent = 0
  let skipped = 0
  let failed = 0
  let dead = 0
  let pushed = 0
  let pushSkipped = 0
  let pushFailed = 0
  let pushDead = 0
  let whatsapped = 0
  let whatsappFailed = 0
  let inApp = 0
  let inAppSkipped = 0
  let smsSent = 0
  let smsFailed = 0

  /** 23505: this outbox row already has its in-app notification. */
  const DUPLICATE = new Set(['23505'])
  /** `notifications.outbox_id` ships in pending/223. */
  const NOT_APPLIED_223 = new Set(['42703', 'PGRST204', '42P01', 'PGRST205'])

  for (const row of rows) {
    const emailDue = row.status === 'pending' && row.next_attempt_at <= now
    const pushDue = row.push_status === 'pending' && row.push_next_attempt_at <= now

    // THE SETTINGS PAGE HAS BEEN WRITING THIS TABLE AND NOTHING READ IT.
    // Measured 2026-09-09: `mayNotify` was called only to DRAW the switches.
    // A customer could turn a kind off in all four channels, see it saved, and
    // keep receiving it -- which `preferences.ts` names in its own header as
    // worse than having no setting at all.
    //
    // Read once per row and used by both legs. Required kinds ignore it
    // entirely (a receipt cannot be switched off) and an absent table reads as
    // "no opinion recorded", which is the same answer defaults-on gives.
    const preferences = await loadPreferenceRows(admin, row.user_id)

    /**
     * THE FOURTH LEG: the in-app notification centre.
     *
     * 198 shipped `notifications` complete - RLS, indexes, realtime - and
     * NOTHING has ever written a row into it. Measured 2026-09-09: the only
     * statements against the table in the whole repository were two SELECTs and
     * an UPDATE of `read_at`. The bell was a finished feature that was empty by
     * construction.
     *
     * It runs BEFORE the `!pushDue` continue below, deliberately: the push leg
     * ends in `continue` on every branch, so anything placed after it is
     * reached only by rows that happen to owe a push.
     *
     * Idempotency is the database's, not this loop's: `outbox_id` is unique and
     * the insert is ON CONFLICT DO NOTHING, so a row seen again on a later run
     * because its OTHER leg is still pending cannot notify twice.
     *
     * No status column and no retry. The row either exists or it does not, and
     * a failure here must never hold up the mail: this is the leg that can be
     * re-derived from the outbox at any time, so it logs and moves on.
     */
    if (row.user_id && isInAppKind(row.kind)) {
      const content = mayNotify(row.kind, 'in_app', preferences)
        ? buildInAppContent(row.kind, (row.payload ?? {}) as Record<string, unknown>)
        : null
      if (content) {
        const { error: inAppError } = await admin.from('notifications' as never).insert({
          user_id: row.user_id,
          kind: row.kind,
          title_he: content.title_he,
          body_he: content.body_he,
          href: content.href,
          outbox_id: row.id,
        } as never)
        if (!inAppError) {
          inApp++
        } else if (DUPLICATE.has(inAppError.code ?? '')) {
          // Already fanned out on an earlier run. Not a failure.
          inAppSkipped++
        } else if (NOT_APPLIED_223.has(inAppError.code ?? '')) {
          // `outbox_id` ships in pending/223. Without it there is no way to be
          // idempotent, and a leg that might notify twice on every retry is
          // worse than a leg that waits for the migration.
          inAppSkipped++
        } else {
          inAppSkipped++
          log.warn('notifications.in_app_insert_failed', {
            kind: row.kind,
            code: inAppError.code ?? null,
          })
        }
      }
    }

    if (emailDue && !mayNotify(row.kind, 'email', preferences)) {
      // `skipped`, not `dead`: the customer can switch it back on, and a dead
      // row would never be looked at again. No attempt is counted either --
      // the row was never sent to a mail provider.
      skipped++
      await admin
        .from('notification_outbox')
        .update({ status: 'skipped', last_error: 'email switched off by the customer' })
        .eq('id', row.id)
    } else if (emailDue) {
      const built = buildNotification(row.kind, row.payload ?? {}, siteUrl)
      if (!built) {
        // A kind nothing can render will never render, however often it is
        // retried, so it is parked immediately rather than burning five attempts.
        dead++
        await admin
          .from('notification_outbox')
          .update({ status: 'dead', last_error: `no template for kind ${row.kind}` })
          .eq('id', row.id)
      } else {
        const result = await sendEmail({
          to: row.recipient_email,
          subject: built.subject,
          html: built.html,
          text: built.text,
          idempotencyKey: row.dedupe_key,
        })

        if (result.ok) {
          sent++
          await admin
            .from('notification_outbox')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              attempts: row.attempts + 1,
              last_error: null,
            })
            .eq('id', row.id)
          // WhatsApp rides the email leg's exactly-once pending->sent
          // transition (see lib/whatsapp/outbox.ts for why it has no state
          // machine of its own). Inert without TWILIO_*, never throws, never
          // touches the row.
          const wa = await sendOutboxWhatsapp(admin, row)
          if (wa === 'sent') whatsapped++
          else if (wa === 'failed') whatsappFailed++

          // THE FIFTH LEG, and until now `lib/sms` had no caller at all:
          // `sendTransactionalSms` was the only function in the repository
          // that sends an SMS and nothing invoked it, so templates, opt-outs,
          // the status webhook and the cost tracking were a finished feature
          // that could not fire.
          //
          // Rides the same exactly-once pending->sent transition WhatsApp
          // does, and for a paid channel that matters more: without a status
          // column of its own there is no retry, and no retry is the correct
          // failure for a message that costs money each time it is attempted.
          const sms = await sendOutboxSms(admin, row, preferences)
          if (sms === 'sent') smsSent++
          else if (sms === 'failed') smsFailed++
        } else if (result.skipped) {
          // No API key is not a failure of this row. Counting it as an attempt
          // would burn the whole queue's retries on a machine that was never
          // configured to send, and the rows would be dead before anybody set
          // the key.
          skipped++
        } else {
          const attempts = row.attempts + 1
          const isDead = attempts >= MAX_ATTEMPTS
          if (isDead) dead++
          else failed++

          await admin
            .from('notification_outbox')
            .update({
              status: isDead ? 'dead' : 'pending',
              attempts,
              last_error: result.reason.slice(0, 500),
              next_attempt_at: new Date(
                Date.now() + backoffMinutes(attempts) * 60_000,
              ).toISOString(),
            })
            .eq('id', row.id)
        }
      }
    }

    if (!pushDue) continue

    // The push leg carries its own status, counter and backoff, so a mail that
    // failed does not hold up a notification the phone could already show, and
    // a phone that is unreachable does not re-send the mail.
    const push = await pushOutboxRow(admin, row, siteUrl, preferences)

    if (push.outcome === 'none') {
      await admin
        .from('notification_outbox')
        .update({ push_status: 'none', push_error: null })
        .eq('id', row.id)
      continue
    }

    if (push.outcome === 'skipped') {
      pushSkipped++
      await admin
        .from('notification_outbox')
        .update({ push_status: 'skipped', push_error: push.reason.slice(0, 500) })
        .eq('id', row.id)
      continue
    }

    if (push.outcome === 'sent') {
      pushed++
      await admin
        .from('notification_outbox')
        .update({
          push_status: 'sent',
          push_sent_at: new Date().toISOString(),
          push_attempts: row.push_attempts + 1,
          push_error: null,
        })
        .eq('id', row.id)
      continue
    }

    const pushAttempts = row.push_attempts + 1
    const pushIsDead = pushAttempts >= MAX_ATTEMPTS
    if (pushIsDead) pushDead++
    else pushFailed++

    await admin
      .from('notification_outbox')
      .update({
        push_status: pushIsDead ? 'dead' : 'pending',
        push_attempts: pushAttempts,
        push_error: push.reason.slice(0, 500),
        push_next_attempt_at: new Date(
          Date.now() + backoffMinutes(pushAttempts) * 60_000,
        ).toISOString(),
      })
      .eq('id', row.id)
  }

  return NextResponse.json({
    ok: true,
    considered: rows.length,
    sent,
    skipped,
    failed,
    dead,
    pushed,
    pushSkipped,
    pushFailed,
    pushDead,
    whatsapped,
    whatsappFailed,
    inApp,
    inAppSkipped,
    smsSent,
    smsFailed,
  })
}

export const GET = withRequestLog('/api/cron/notifications', handleGET)
