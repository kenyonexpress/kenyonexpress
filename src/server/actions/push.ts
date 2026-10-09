'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { isMissingPushRelation, pushSubscriptionTable } from '@/lib/push/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { headers } from 'next/headers'

/**
 * Web push subscriptions: store what the browser mints, delete it on opt-out.
 *
 * Rows live in `push_subscriptions` (migration 179, pending), written only
 * here, only for an authenticated caller, only with the service role: 179
 * grants no INSERT or UPDATE policy on purpose, so nobody can attach an
 * arbitrary endpoint to an account with the anon key.
 *
 * Both actions answer "not available yet" while 179 is unapplied, the same
 * contract as passkeys: the notifications page must render either way.
 */

export type PushActionState = { success: true } | { error: string }

const NOT_AVAILABLE = 'התראות עדיין לא זמינות בחשבון הזה, נסו שוב בקרוב'
const NOT_SIGNED_IN = 'צריך להתחבר כדי להפעיל התראות'
const BAD_SUBSCRIPTION = 'שמירת ההתראות נכשלה, נסו שוב'
const RATE_LIMITED = 'יותר מדי ניסיונות, נסו שוב בעוד שעה'

/** The one Hebrew sentence a failure ever shows; the reason is logged. */
function fail(
  event: string,
  reason: string,
  message: string = BAD_SUBSCRIPTION,
): { error: string } {
  log.warn(event, { reason })
  return { error: message }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

/**
 * The subset of PushSubscription.toJSON() we store. Validated to the wire
 * format's own shape: an https endpoint (W3C requires it), a 65-byte P-256
 * point for p256dh (87 base64url chars) and a 16-byte auth secret (22 chars).
 * Anything else is either a broken browser or a forged payload, and both get
 * the same refusal.
 */
export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

function validateSubscription(input: PushSubscriptionInput): string | null {
  if (
    typeof input?.endpoint !== 'string' ||
    typeof input.keys?.p256dh !== 'string' ||
    typeof input.keys?.auth !== 'string'
  ) {
    return 'shape'
  }
  if (!input.endpoint.startsWith('https://') || input.endpoint.length > 2000) return 'endpoint'
  if (input.keys.p256dh.length !== 87 || !BASE64URL.test(input.keys.p256dh)) return 'p256dh'
  if (input.keys.auth.length !== 22 || !BASE64URL.test(input.keys.auth)) return 'auth'
  return null
}

export async function savePushSubscription(input: PushSubscriptionInput): Promise<PushActionState> {
  return withActionContext('push.subscribe', () => runSave(input))
}

async function runSave(input: PushSubscriptionInput): Promise<PushActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_SIGNED_IN }

  const ip = await getClientIp()
  const allowed = await checkRateLimit(`push-subscribe:${ip}`, 30, 3600)
  if (!allowed) return { error: RATE_LIMITED }

  const invalid = validateSubscription(input)
  if (invalid) return fail('push.subscribe_rejected', invalid)

  const headerStore = await headers()
  const userAgent = headerStore.get('user-agent')?.slice(0, 256) ?? null

  // Conflict on endpoint, not on (user, endpoint): a subscription belongs to
  // the browser, and on a shared device the latest signed-in account wins it,
  // which is the only assignment that cannot notify the wrong person.
  const admin = createAdminClient()
  const { error } = await admin.from(pushSubscriptionTable()).upsert(
    {
      endpoint: input.endpoint,
      user_id: user.id,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      user_agent: userAgent,
    } as never,
    { onConflict: 'endpoint' },
  )
  if (error) {
    if (isMissingPushRelation(error)) return { error: NOT_AVAILABLE }
    return fail('push.subscribe_failed', error.message)
  }
  return { success: true }
}

export async function removePushSubscription(endpoint: string): Promise<PushActionState> {
  return withActionContext('push.unsubscribe', () => runRemove(endpoint))
}

async function runRemove(endpoint: string): Promise<PushActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_SIGNED_IN }

  if (typeof endpoint !== 'string' || endpoint.length > 2000) {
    return fail('push.unsubscribe_rejected', 'endpoint')
  }

  // Filtered on user_id as well as endpoint, so the service role never
  // deletes a row the caller does not own.
  const admin = createAdminClient()
  const { error } = await admin
    .from(pushSubscriptionTable())
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)
  if (error) {
    if (isMissingPushRelation(error)) return { error: NOT_AVAILABLE }
    return fail('push.unsubscribe_failed', error.message)
  }
  return { success: true }
}
