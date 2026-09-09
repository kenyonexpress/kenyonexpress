/**
 * Typed access to `push_subscriptions`, which migration 179 creates.
 *
 * **179 IS APPLIED. This header said it was not, until it was read on
 * 2026-09-09**: the table is in production and holds zero rows. The `as never`
 * assertion and the `isMissingPushRelation` guard below both stay, because the
 * generated `database.ts` still does not carry the table and a preview branch
 * is a database where it really is absent. What changed is the claim.
 *
 * Same story and same shape as lib/auth/passkeys/store.ts (178), and again a
 * separate file so neither apply-day breaks the other. WHEN 179 IS APPLIED:
 * regenerate database.ts, delete this row type and `pushSubscriptionTable`,
 * and use the client directly at the call sites in server/actions/push.ts.
 *
 * Until then every read or write can come back "relation does not exist", and
 * the callers must treat that as "notifications not available yet", never as
 * a crash: an account page whose optional extra is unmigrated still has to
 * render.
 */

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
  updated_at: string
}

/**
 * Names the table the generated types do not know, for `.from()`. The only
 * place this file asserts anything, same confinement as `passkeyTable`.
 */
export function pushSubscriptionTable(): never {
  return 'push_subscriptions' as never
}

/**
 * Whether a PostgREST error means "179 has not been applied" rather than a
 * real failure. 42P01 is Postgres undefined_table; PGRST205 is PostgREST's
 * schema-cache miss, which is what the REST API actually returns. The message
 * fallback covers the window where the error arrives with neither code.
 */
export function isMissingPushRelation(
  error: {
    code?: string
    message?: string
  } | null,
): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('push_subscriptions') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  )
}
