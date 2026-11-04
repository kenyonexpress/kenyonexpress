'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { isMissingPushRelation, pushSubscriptionTable } from '@/lib/push/store'
import { normalizeTopics } from '@/lib/push/topics'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import {
  type PushSubscriptionInput,
  type WriteResult,
  deletePushSubscription,
  updatePushSubscriptionTopics,
  upsertPushSubscription,
} from '@/server/push/subscription-write'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

/**
 * Web push subscriptions: store what the browser mints, delete it on opt-out.
 *
 * Rows live in `push_subscriptions` (migration 179, pending), written only
 * here, only for an authenticated caller, only with the service role: 179
 * grants no INSERT or UPDATE policy on purpose, so nobody can attach an
 * arbitrary endpoint to an account with the anon key.
 *
 * All three actions answer "not available yet" while 179 is unapplied, the
 * same contract as passkeys: the notifications page must render either way.
 *
 * Two ways to remove. `removePushSubscription(endpoint)` is what THIS browser
 * calls after it has unsubscribed itself; `removePushSubscriptionById(id)` is
 * the list on the notifications page removing ANOTHER browser (the phone that
 * was lost, the shared computer). The second cannot unsubscribe the far
 * browser, so the sender's next attempt at it answers 201 into a row that no
 * longer exists -- which is fine: without a row there is no attempt at all.
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

export type { PushSubscriptionInput }

/** A write result to the action's one-sentence contract; the reason is logged. */
function toState(event: string, result: WriteResult): PushActionState {
  if (result.ok) {
    revalidatePath('/account/notifications')
    return { success: true }
  }
  if (result.reason === 'unavailable') return { error: NOT_AVAILABLE }
  return fail(event, result.detail)
}

/**
 * `topics` is optional and S21's: the opt-in button sends none, which keeps
 * whatever this browser already had (both, for a new row).
 */
export async function savePushSubscription(
  input: PushSubscriptionInput,
  topics?: unknown,
): Promise<PushActionState> {
  return withActionContext('push.subscribe', () => runSave(input, topics))
}

async function runSave(input: PushSubscriptionInput, topics: unknown): Promise<PushActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_SIGNED_IN }

  const ip = await getClientIp()
  const allowed = await checkRateLimit(`push-subscribe:${ip}`, 30, 3600)
  if (!allowed) return { error: RATE_LIMITED }

  const chosen = topics === undefined ? undefined : normalizeTopics(topics)
  if (chosen === null) return fail('push.subscribe_rejected', 'topics')

  const headerStore = await headers()
  const userAgent = headerStore.get('user-agent')?.slice(0, 256) ?? null

  const result = await upsertPushSubscription({
    userId: user.id,
    input,
    userAgent,
    topics: chosen,
  })
  if (!result.ok && result.reason === 'invalid') {
    return fail('push.subscribe_rejected', result.detail)
  }
  return toState('push.subscribe_failed', result)
}

/**
 * S21: which topics THIS browser gets (`order_updates`, `expiry`). Keyed on
 * the endpoint the browser reads from its own subscription; filtered on the
 * caller, so it cannot retopic somebody else's browser.
 */
export async function updatePushTopics(
  endpoint: string,
  topics: unknown,
): Promise<PushActionState> {
  return withActionContext('push.topics', () => runUpdateTopics(endpoint, topics))
}

async function runUpdateTopics(endpoint: string, topics: unknown): Promise<PushActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_SIGNED_IN }

  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2000) {
    return fail('push.topics_rejected', 'endpoint')
  }
  const chosen = normalizeTopics(topics)
  if (chosen === null || topics === undefined) return fail('push.topics_rejected', 'topics')

  const ip = await getClientIp()
  const allowed = await checkRateLimit(`push-subscribe:${ip}`, 30, 3600)
  if (!allowed) return { error: RATE_LIMITED }

  return toState(
    'push.topics_failed',
    await updatePushSubscriptionTopics(user.id, endpoint, chosen),
  )
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
  return toState('push.unsubscribe_failed', await deletePushSubscription(user.id, endpoint))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Remove one of the caller's own browsers from the list, by row id. */
export async function removePushSubscriptionById(id: string): Promise<PushActionState> {
  return withActionContext('push.unsubscribe_device', () => runRemoveById(id))
}

async function runRemoveById(id: string): Promise<PushActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_SIGNED_IN }

  if (typeof id !== 'string' || !UUID.test(id)) {
    return fail('push.unsubscribe_device_rejected', 'id')
  }

  // Same shape as runRemove: the service role deletes, and the user_id filter
  // is what keeps it to the caller's own rows. Filtering by id alone would let
  // any signed-in account silence any other account's browser by guessing.
  const admin = createAdminClient()
  const { error } = await admin
    .from(pushSubscriptionTable())
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) {
    if (isMissingPushRelation(error)) return { error: NOT_AVAILABLE }
    return fail('push.unsubscribe_device_failed', error.message)
  }
  revalidatePath('/account/notifications')
  return { success: true }
}
