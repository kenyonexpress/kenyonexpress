import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The suppression list, from the application's side.
 *
 * THE TABLE HAS EXISTED SINCE 095 AND HAS NEVER HELD A ROW. `fn_enqueue_notification`
 * has checked it before queueing since the day it was written, and pending 190
 * checks it too - so the READER has been in place for months and has always
 * found it empty, because Resend reports a bounce or a complaint exactly once,
 * over a webhook, and nothing listened. 207 adds the writer's half; this module
 * is what the send path and the webhook call.
 *
 * IT COVERS THE PATH THE OUTBOX DOES NOT. `fn_enqueue_notification` protects
 * mail that goes through the notification outbox. Nine call sites reach
 * `sendEmail` directly - the coupon delivery from `finalizeOrder`, the magic
 * link, the weekly digest, the abandoned-cart nudge, the contact form - and
 * none of them passes through that function. Without this module a hard-bounced
 * address stays suppressed for one kind of mail and mailed by the other five.
 *
 * IT FAILS OPEN, DELIBERATELY, AND THAT IS THE UNCOMFORTABLE CHOICE. If the
 * suppression read itself fails - the table is not there because 207 is
 * unapplied, or the database is unreachable - `isSuppressed` returns false and
 * the mail is sent. Failing closed would mean an outage in one table silences
 * the coupon a customer just paid for, and a coupon that never arrives is a
 * refund and a support ticket. A suppressed address mailed once more during an
 * outage is a reputation cost measured in one message. The asymmetry is the
 * argument, and it is logged either way.
 */

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703', 'PGRST202', '42883'])

function missing(code: string | undefined): boolean {
  return MISSING.has(code ?? '')
}

let notAppliedReported = false

function reportNotApplied(): void {
  if (notAppliedReported) return
  notAppliedReported = true
  log.info('email.suppression_not_applied', { migration: '207_email_deliverability.sql' })
}

/** The reasons 095's CHECK permits. `unsubscribed`, not `unsubscribe`. */
export type SuppressionReason = 'hard_bounce' | 'complaint' | 'unsubscribed' | 'manual'

/**
 * Is this address on the list?
 *
 * Lowercased here as well as in the database, because the CHECK 207 adds is
 * what keeps the STORED value normalised and this is the LOOKUP. The two were
 * previously neither: `email` was the primary key with no case rule while every
 * reader compared `lower(s.email)`, so `Person@x.com` and `person@x.com` were
 * two rows and a suppression under one was invisible to a check against the
 * other.
 */
export async function isSuppressed(email: string): Promise<boolean> {
  const address = email.trim().toLowerCase()
  if (address.length === 0) return false

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('email_suppressions')
      .select('email')
      .eq('email', address)
      .maybeSingle()

    if (error) {
      if (missing(error.code)) reportNotApplied()
      else log.warn('email.suppression_read_failed', { reason: error.message })
      return false
    }
    return data !== null
  } catch (error) {
    log.warn('email.suppression_read_threw', { err: error })
    return false
  }
}

/**
 * Add an address to the list, or strengthen the reason on one already there.
 *
 * Goes through `suppress_email`, not a PostgREST upsert, because the ranking
 * that stops a later `manual` from erasing a `complaint` lives in the function.
 * An upsert from here would express "last writer wins", which is the one rule
 * that must not apply to a receiver telling us the mail was unwanted.
 */
export async function suppressEmail(
  email: string,
  reason: SuppressionReason,
  source?: string,
  detail?: string,
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.rpc(
      'suppress_email' as never,
      {
        p_email: email,
        p_reason: reason,
        p_source: source ?? null,
        p_detail: detail ?? null,
      } as never,
    )

    if (error) {
      if (missing(error.code)) {
        reportNotApplied()
        return false
      }
      log.error('email.suppression_write_failed', { reason: error.message })
      return false
    }
    return true
  } catch (error) {
    log.error('email.suppression_write_threw', { err: error })
    return false
  }
}

/**
 * Count one email event against a template, for the day.
 *
 * NO ADDRESS IS PASSED AND NONE IS STORED. `email_events_daily` is a counter
 * per (day, template, event); it answers "is the coupon mail being opened less
 * than it was" and cannot answer "did this customer open it". That is the whole
 * of [60]'s "respecting privacy", on a site whose privacy page already promises
 * search terms are kept without a user and without an IP.
 */
export async function countEmailEvent(template: string, event: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.rpc(
      'bump_email_event' as never,
      {
        p_template: template,
        p_event: event,
      } as never,
    )
    if (error) {
      if (missing(error.code)) reportNotApplied()
      else log.warn('email.event_count_failed', { reason: error.message, event })
    }
  } catch (error) {
    log.warn('email.event_count_threw', { err: error })
  }
}

/** Test seam. Never called by application code. */
export function __resetSuppressionWarning(): void {
  notAppliedReported = false
}
