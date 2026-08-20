import type { SupabaseClient } from '@supabase/supabase-js'
import type { RenderedEmail } from './emails/render.ts'
import { sendEmail } from './resend.ts'
import type { EmailAttachment } from './resend.ts'

/**
 * The claim / send / settle loop that all three `notify-*` functions share.
 *
 * WHY A CLAIM AND NOT A PLAIN SELECT. `notification_outbox` already has a
 * second drain: `/api/cron/notifications` on the Next side, which selects
 * `status = 'pending'`. Two drains reading the same predicate would each send
 * the same row. `fn_claim_notification_batch` (migration `088`) moves rows to
 * `sending` under FOR UPDATE SKIP LOCKED, which makes them invisible to that
 * query, and leases them so a function that dies mid-batch does not strand
 * them forever. Resend's idempotency key is the second line of defence, not
 * the first.
 *
 * WHY SETTLING IS AN RPC AND NOT TWO UPDATES. The row's new state and its
 * `notification_log` line have to land together. A `sent` row with no log line
 * is a delivery nobody can trace; a log line with the row still `sending` is a
 * message that will be sent again when the lease expires.
 *
 * WHY ONE BAD ROW DOES NOT STOP THE BATCH. A queue drain that throws on the
 * first malformed payload delivers nothing for everyone behind it. Each row is
 * wrapped; the failure is settled onto that row and the loop continues.
 */

export interface OutboxRow {
  id: string
  kind: string
  recipient_email: string
  payload: Record<string, unknown> | null
  dedupe_key: string
  attempts: number
  user_id: string | null
}

export interface Prepared {
  email: RenderedEmail
  attachments?: readonly EmailAttachment[]
  replyTo?: string
}

/**
 * What a caller returns for one row.
 *
 * `null` means "there is nothing to send for this row and there never will be"
 * — a payload with no order id, a voucher that has since been redeemed. Those
 * are settled as terminal rather than retried five times, because the fifth
 * attempt reads the same row as the first.
 */
export type Preparer = (row: OutboxRow) => Promise<Prepared | null>

export interface DrainResult {
  claimed: number
  sent: number
  failed: number
  skipped: number
}

export async function drain(
  admin: SupabaseClient,
  options: {
    kinds: readonly string[]
    limit: number
    /** Names this drain in `notification_log.source`. */
    source: string
    prepare: Preparer
    /** Minutes a claimed row stays invisible if this run never settles it. */
    leaseMinutes?: number
  },
): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 }

  const { data, error } = await admin.rpc('fn_claim_notification_batch', {
    p_kinds: options.kinds,
    p_limit: options.limit,
    p_lease_minutes: options.leaseMinutes ?? 5,
  })

  if (error) {
    console.error(`${options.source}: claim failed`, error.message)
    throw new Error(`claim_failed: ${error.message}`)
  }

  const rows = (data ?? []) as OutboxRow[]
  result.claimed = rows.length

  for (const row of rows) {
    try {
      const prepared = await options.prepare(row)

      if (!prepared) {
        result.skipped++
        // Terminal on purpose. `fn_settle_notification` counts this as a
        // failure and will park the row as `dead` once it has run out of
        // attempts, which is a state an admin can see, rather than a row that
        // silently disappears from every count.
        await settle(admin, row.id, false, null, 'nothing_to_send', options.source)
        continue
      }

      const outcome = await sendEmail({
        to: row.recipient_email,
        subject: prepared.email.subject,
        html: prepared.email.html,
        text: prepared.email.text,
        // The dedupe key IS the idempotency key. Same logical email, same
        // string, whichever drain gets there first.
        idempotencyKey: row.dedupe_key,
        replyTo: prepared.replyTo,
        attachments: prepared.attachments,
      })

      if (outcome.ok) {
        result.sent++
        await settle(admin, row.id, true, outcome.id, null, options.source)
      } else {
        result.failed++
        await settle(admin, row.id, false, null, outcome.reason, options.source)
      }
    } catch (error) {
      result.failed++
      const message = error instanceof Error ? error.message : String(error)
      console.error(`${options.source}: row ${row.id} failed`, message)
      await settle(admin, row.id, false, null, `exception: ${message}`, options.source).catch(
        () => undefined,
      )
    }
  }

  return result
}

async function settle(
  admin: SupabaseClient,
  id: string,
  ok: boolean,
  providerId: string | null,
  error: string | null,
  source: string,
): Promise<void> {
  const { error: rpcError } = await admin.rpc('fn_settle_notification', {
    p_id: id,
    p_ok: ok,
    p_provider_id: providerId,
    p_error: error,
    p_source: source,
  })
  if (rpcError) {
    // The row keeps its lease and comes back when it expires. Losing the
    // settle is recoverable; throwing here would abandon the rest of the batch.
    console.error(`${source}: settle failed for ${id}`, rpcError.message)
  }
}

/** Payload fields arrive as `Json`; these keep the casts in one place. */
export function readString(
  payload: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = payload?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readNumber(
  payload: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = payload?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
