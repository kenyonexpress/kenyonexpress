import { buildNotification } from '@/lib/email/notifications'
import { sendEmail } from '@/lib/email/resend'
import type { SupabaseClient } from '@supabase/supabase-js'

/** One run's ceiling. A backlog drains over consecutive runs. */
export const NOTIFICATION_BATCH = 50

/** Attempts before a row is parked as dead rather than retried forever. */
export const NOTIFICATION_MAX_ATTEMPTS = 5

/** 2, 8, 32, 128 minutes. Long enough for a provider outage to end. */
export function notificationBackoffMinutes(attempts: number): number {
  return 2 * 4 ** Math.max(0, attempts - 1)
}

export type OutboxRow = {
  id: string
  kind: string
  recipient_email: string
  payload: Record<string, unknown> | null
  dedupe_key: string
  attempts: number
}

export type DrainResult = {
  considered: number
  sent: number
  skipped: number
  failed: number
  dead: number
}

/**
 * Claim due outbox rows and send through Resend.
 * Shared by GET/POST /api/cron/notifications and the Edge twin.
 */
export async function drainNotificationOutbox(
  admin: SupabaseClient,
  siteUrl: string,
): Promise<DrainResult> {
  const { data, error } = await admin
    .from('notification_outbox')
    .select('id, kind, recipient_email, payload, dedupe_key, attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(NOTIFICATION_BATCH)

  if (error) {
    throw new Error(`notification outbox read failed: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as OutboxRow[]
  let sent = 0
  let skipped = 0
  let failed = 0
  let dead = 0

  for (const row of rows) {
    const built = buildNotification(row.kind, row.payload ?? {}, siteUrl)
    if (!built) {
      dead++
      await admin
        .from('notification_outbox')
        .update({ status: 'dead', last_error: `no template for kind ${row.kind}` })
        .eq('id', row.id)
      continue
    }

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
      continue
    }

    if (result.skipped) {
      skipped++
      continue
    }

    const attempts = row.attempts + 1
    // Non-retryable 4xx (bad address / refused body) will fail identically on
    // every attempt, so park immediately rather than burning the backoff ladder.
    const isDead = !result.retryable || attempts >= NOTIFICATION_MAX_ATTEMPTS
    if (isDead) dead++
    else failed++

    await admin
      .from('notification_outbox')
      .update({
        status: isDead ? 'dead' : 'pending',
        attempts,
        last_error: result.reason.slice(0, 500),
        next_attempt_at: new Date(
          Date.now() + notificationBackoffMinutes(attempts) * 60_000,
        ).toISOString(),
      })
      .eq('id', row.id)
  }

  return { considered: rows.length, sent, skipped, failed, dead }
}
