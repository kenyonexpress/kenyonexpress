import 'server-only'

import { isMissingPushRelation, pushSubscriptionTable } from '@/lib/push/store'
import { type PushTopic, normalizeTopics } from '@/lib/push/topics'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The one write path into `push_subscriptions`, shared by the server action
 * (the opt-in button on /account/notifications) and the route the service
 * worker posts to when a subscription rotates (S21).
 *
 * NOT A 'use server' FILE, deliberately. Every export of one is a callable
 * endpoint, and these take a `userId` argument: exported from an action
 * module, any signed-in browser could store a subscription against any
 * account. Callers authenticate first and pass the verified id.
 *
 * Service role, because 179 grants no INSERT or UPDATE policy: nobody can
 * attach an endpoint to an account with the anon key.
 */

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type WriteResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; detail: string }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'failed'; detail: string }

const BASE64URL = /^[A-Za-z0-9_-]+$/

/**
 * The subset of PushSubscription.toJSON() we store, validated to the wire
 * format's own shape: an https endpoint (W3C requires it), a 65-byte P-256
 * point for p256dh (87 base64url chars) and a 16-byte auth secret (22 chars).
 * Anything else is a broken browser or a forged payload; both are refused.
 */
export function validateSubscription(input: unknown): string | null {
  const candidate = input as Partial<PushSubscriptionInput> | null
  if (
    typeof candidate?.endpoint !== 'string' ||
    typeof candidate.keys?.p256dh !== 'string' ||
    typeof candidate.keys?.auth !== 'string'
  ) {
    return 'shape'
  }
  if (!candidate.endpoint.startsWith('https://') || candidate.endpoint.length > 2000) {
    return 'endpoint'
  }
  if (candidate.keys.p256dh.length !== 87 || !BASE64URL.test(candidate.keys.p256dh)) {
    return 'p256dh'
  }
  if (candidate.keys.auth.length !== 22 || !BASE64URL.test(candidate.keys.auth)) return 'auth'
  return null
}

/** PostgREST's "no such column": 259 not applied on this database. */
function isMissingTopicsColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === '42703') return true
  const message = error.message ?? ''
  return message.includes("'topics' column") || message.includes('column "topics"')
}

/**
 * Upsert one browser for one account.
 *
 * `topics` undefined leaves the column alone: a new row takes 259's default
 * (both), and a re-save of an existing row keeps what the customer chose.
 * Re-pressing "enable" must not undo the boxes they unticked.
 *
 * Conflict on endpoint, not on (user, endpoint): a subscription belongs to the
 * browser, and on a shared device the latest signed-in account wins it, which
 * is the only assignment that cannot notify the wrong person.
 */
export async function upsertPushSubscription(args: {
  userId: string
  input: unknown
  userAgent: string | null
  topics?: readonly PushTopic[]
}): Promise<WriteResult> {
  const invalid = validateSubscription(args.input)
  if (invalid) return { ok: false, reason: 'invalid', detail: invalid }
  const input = args.input as PushSubscriptionInput

  const base = {
    endpoint: input.endpoint,
    user_id: args.userId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: args.userAgent,
  }
  const row = args.topics ? { ...base, topics: [...args.topics] } : base

  const admin = createAdminClient()
  let { error } = await admin
    .from(pushSubscriptionTable())
    .upsert(row as never, { onConflict: 'endpoint' })

  // Before 259 the column does not exist. Storing the browser without its
  // topics is right: the sender treats a row with no topics as "everything",
  // which is what this browser asked for until there was a choice.
  if (error && args.topics && isMissingTopicsColumn(error)) {
    ;({ error } = await admin
      .from(pushSubscriptionTable())
      .upsert(base as never, { onConflict: 'endpoint' }))
  }

  if (error) {
    if (isMissingPushRelation(error)) return { ok: false, reason: 'unavailable' }
    return { ok: false, reason: 'failed', detail: error.message }
  }
  return { ok: true }
}

/**
 * The topics of one of the caller's rows, or null. Used to carry a choice
 * across a rotation: the replacement row inherits what the old one had.
 */
export async function readPushTopics(
  userId: string,
  endpoint: string,
): Promise<PushTopic[] | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(pushSubscriptionTable())
    .select('topics')
    .eq('endpoint', endpoint)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return normalizeTopics((data as { topics?: unknown }).topics)
}

/** Delete one of the caller's rows by endpoint. The user filter is the guard. */
export async function deletePushSubscription(
  userId: string,
  endpoint: string,
): Promise<WriteResult> {
  const admin = createAdminClient()
  const { error } = await admin
    .from(pushSubscriptionTable())
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', userId)
  if (error) {
    if (isMissingPushRelation(error)) return { ok: false, reason: 'unavailable' }
    return { ok: false, reason: 'failed', detail: error.message }
  }
  return { ok: true }
}

/**
 * Set the topics of one of the caller's browsers. Zero rows matched is a
 * failure, not a success: the box the customer ticked would otherwise read as
 * saved for a browser the server does not know.
 */
export async function updatePushSubscriptionTopics(
  userId: string,
  endpoint: string,
  topics: readonly PushTopic[],
): Promise<WriteResult> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(pushSubscriptionTable())
    .update({ topics: [...topics] } as never)
    .eq('endpoint', endpoint)
    .eq('user_id', userId)
    .select('id')
  if (error) {
    if (isMissingPushRelation(error) || isMissingTopicsColumn(error)) {
      return { ok: false, reason: 'unavailable' }
    }
    return { ok: false, reason: 'failed', detail: error.message }
  }
  if (!data || data.length === 0) return { ok: false, reason: 'failed', detail: 'no row' }
  return { ok: true }
}
