import { log } from '@/lib/observability/log'
import { isOptOutExempt } from '@/lib/sms/opt-out'
import { type SmsKind, buildSmsMessage } from '@/lib/sms/templates'
import { isSmsEnabled, sendSms, toSmsAddress } from '@/lib/sms/twilio'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One SMS, from a kind and a payload to a row in the log.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN. Each one is cheaper than the one after
 * it and each rules out a way of spending money badly:
 *
 *   flag off          costs nothing, and is the master switch
 *   no template       this kind never owes an SMS; settle, do not retry
 *   bad number        a landline or a malformed string. Twilio ACCEPTS and
 *                     BILLS an SMS to an Israeli landline and delivers it
 *                     nowhere, so this is a refusal that saves real money
 *   opted out         checked LAST of the free checks and before the send,
 *                     because it is the only one that costs a query
 *   send
 *
 * NOTHING HERE THROWS. Every caller sits after something that already happened
 * -- an order shipped, a refund cleared, a customer asked for a code -- and an
 * unreachable SMS provider must not fail that flow.
 */

export type SmsOutcome =
  | { outcome: 'sent'; sid: string; segments: number }
  /** Nothing was attempted. Never retry, never count an attempt. */
  | { outcome: 'skipped'; reason: string }
  /** Attempted and failed. Worth another go. */
  | { outcome: 'failed'; reason: string }

/** Postgres undefined_table, and PostgREST's schema-cache equivalent. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

/**
 * Is this handset opted out right now?
 *
 * FAILS CLOSED, and this is the one place in the notification stack that does.
 * Everywhere else an unreadable preference table means "no opinion recorded"
 * and the message goes; here an unreadable opt-out table means the message does
 * NOT go. The asymmetry is deliberate: sending to somebody who asked us to stop
 * is a legal matter under תיקון 40 and a complaint to the carrier that can cost
 * the sender ID, while failing to send is a message that arrives by email
 * instead.
 *
 * An ABSENT table (216 unapplied) is the exception to the exception: there is
 * no opt-out list yet because there is no SMS yet, so there is nobody to have
 * opted out.
 */
export async function isOptedOut(admin: SupabaseClient, toE164: string): Promise<boolean | null> {
  const { data, error } = await admin
    .from('sms_opt_outs' as never)
    .select('to_e164')
    .eq('to_e164', toE164)
    .is('resumed_at', null)
    .maybeSingle()

  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) return false
    log.warn('sms.opt_out_check_failed', { reason: error.message })
    // null means "could not tell", and the caller refuses on it.
    return null
  }
  return data !== null
}

export async function sendTransactionalSms(
  admin: SupabaseClient,
  args: {
    kind: SmsKind
    payload: Record<string, unknown>
    /** Any of the forms the profiles table holds; normalised here. */
    phone: string | null | undefined
    userId?: string | null
    env?: NodeJS.ProcessEnv
  },
): Promise<SmsOutcome> {
  const env = args.env ?? process.env

  if (!isSmsEnabled(env)) return { outcome: 'skipped', reason: 'SMS is switched off' }

  const built = buildSmsMessage(args.kind, args.payload)
  if (!built) return { outcome: 'skipped', reason: `no SMS template for ${args.kind}` }

  const to = toSmsAddress(args.phone)
  if (!to) {
    // Includes every Israeli landline. Twilio would accept and bill it.
    return { outcome: 'skipped', reason: 'not a reachable Israeli mobile' }
  }

  if (!isOptOutExempt(args.kind)) {
    const optedOut = await isOptedOut(admin, to)
    if (optedOut === null) {
      return { outcome: 'skipped', reason: 'could not read the opt-out list; refusing to send' }
    }
    if (optedOut) return { outcome: 'skipped', reason: 'this number asked us to stop' }
  }

  const result = await sendSms({
    to,
    body: built.body,
    statusCallback: statusCallbackUrl(env),
    env,
  })

  if (!result.ok && result.skipped) return { outcome: 'skipped', reason: result.reason }

  if (!result.ok) {
    // Logged with no SID: the row exists so a failure that never reached
    // Twilio is still visible next to the ones that did.
    await recordSms(admin, {
      providerSid: null,
      userId: args.userId ?? null,
      toE164: to,
      kind: args.kind,
      status: 'failed',
      segments: built.segments,
      errorMessage: result.error,
    })
    return { outcome: 'failed', reason: result.error }
  }

  await recordSms(admin, {
    providerSid: result.sid || null,
    userId: args.userId ?? null,
    toE164: to,
    kind: args.kind,
    // `queued`, not `sent`. Twilio's POST response means accepted, and the
    // status callback is what turns it into delivered or failed. Recording
    // `sent` here would make the log say every message arrived.
    status: 'queued',
    segments: result.segments,
    errorMessage: null,
  })

  return { outcome: 'sent', sid: result.sid, segments: result.segments }
}

function statusCallbackUrl(env: NodeJS.ProcessEnv): string | undefined {
  const site = env.NEXT_PUBLIC_APP_URL
  if (!site) return undefined
  return `${site.replace(/\/+$/, '')}/api/webhooks/twilio-sms`
}

async function recordSms(
  admin: SupabaseClient,
  row: {
    providerSid: string | null
    userId: string | null
    toE164: string
    kind: string
    status: string
    segments: number
    errorMessage: string | null
  },
): Promise<void> {
  const { error } = await admin.from('sms_messages' as never).insert({
    provider_sid: row.providerSid,
    user_id: row.userId,
    to_e164: row.toE164,
    kind: row.kind,
    status: row.status,
    segments: row.segments,
    error_message: row.errorMessage?.slice(0, 500) ?? null,
  } as never)

  // The log is not the job. 216 is written and unapplied, so every insert fails
  // until it lands, and a message that was sent must not be reported as failed
  // because the record of it could not be written.
  if (error && !MISSING_TABLE.has(error.code ?? '')) {
    log.warn('sms.log_write_failed', { reason: error.message })
  }
}
