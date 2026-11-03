import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The writer's half of the suppression list.
 *
 * `email_suppressions` (095) is read before every outbox enqueue and by the
 * voucher, newsletter and wishlist senders, and it has never held a row:
 * Resend reports a hard bounce or a complaint exactly once, over the webhook,
 * and nothing listened. `/api/webhooks/resend` calls this.
 *
 * A PLAIN INSERT, NOT 207's `suppress_email` RPC. 207 is still pending, and
 * the table with its CHECK on `reason` is live already (measured 03.11). The
 * ranking 207 adds (a later `manual` must not erase a `complaint`) is kept
 * here by never updating: an address already on the list keeps the row it
 * has, and any row suppresses. First writer wins, and the only thing a later
 * event could change is the label, never whether the address is mailed.
 */

export type SuppressionReason = 'hard_bounce' | 'complaint' | 'unsubscribed' | 'manual'

export async function suppressEmail(
  email: string,
  reason: SuppressionReason,
  detail?: string,
): Promise<boolean> {
  const address = email.trim().toLowerCase()
  if (address.length === 0) return false

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('email_suppressions')
      .upsert(
        { email: address, reason, detail: detail ?? null },
        { onConflict: 'email', ignoreDuplicates: true },
      )
    if (error) {
      log.error('email.suppression_write_failed', { reason: error.message })
      return false
    }
    return true
  } catch (error) {
    log.error('email.suppression_write_threw', { err: error })
    return false
  }
}
