import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { type UnsubscribeScope, verifyUnsubscribeToken } from '@/lib/wishlist/unsubscribe-token'

/**
 * The write behind the signed unsubscribe link.
 *
 * DELIBERATELY NOT A SERVER ACTION. The page that calls this is a server
 * component; an exported action would be one more unauthenticated network
 * endpoint to justify in auth-coverage.test.ts, for a function only one page
 * calls in-process. The HMAC over (user, scope, expiry) is the authorisation:
 * only the server's secret can have produced it, so no session is asked for,
 * which is the point of a link that must work from an email client.
 *
 * The write goes through the ADMIN client because the reader is not signed
 * in. It can only ever turn alerts OFF: scope `alerts` clears the two alert
 * flags, `digest` clears the digest flag, `all` clears all three, and nothing
 * here can switch anything on, so the worst a leaked token can do is quiet.
 */

export type UnsubscribeOutcome =
  | { ok: true; scope: UnsubscribeScope }
  | { ok: false; reason: 'invalid' | 'unavailable' }

const OFF: Record<UnsubscribeScope, Record<string, boolean>> = {
  alerts: { price_drop: false, back_in_stock: false },
  digest: { weekly_digest: false },
  all: { price_drop: false, back_in_stock: false, weekly_digest: false },
}

export async function applyWishlistUnsubscribe(
  token: string | null | undefined,
): Promise<UnsubscribeOutcome> {
  const verified = verifyUnsubscribeToken(token)
  if (!verified) return { ok: false, reason: 'invalid' }

  const admin = createAdminClient()
  const { error } = await admin.from('wishlist_alert_prefs' as never).upsert(
    {
      user_id: verified.userId,
      // Untouched flags keep their column DEFAULT on insert and their stored
      // value on conflict, because only the named columns are updated.
      ...OFF[verified.scope],
    } as never,
    { onConflict: 'user_id' } as never,
  )
  if (error) {
    log.warn('wishlist_unsubscribe.write_failed', {
      code: error.code ?? null,
      scope: verified.scope,
    })
    return { ok: false, reason: 'unavailable' }
  }
  return { ok: true, scope: verified.scope }
}
