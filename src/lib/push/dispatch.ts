import { type ExpoPushMessage, isExpoPushToken, sendExpoPush } from '@/lib/push/expo'
import { type PushContent, buildPushContent } from '@/lib/push/templates'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One outbox row's push leg, from templating to token bookkeeping.
 *
 * Lifted out of the cron route so it can be tested without a request: the route
 * is now nothing but auth, a query, and a loop.
 *
 * THE FOUR OUTCOMES ARE NOT INTERCHANGEABLE, and collapsing any two of them
 * would produce a queue that lies:
 *
 *   'none'    - this KIND owes no push, ever. Settled permanently on the first
 *               look. A supplier sale alert lands here.
 *   'skipped' - push is owed but could not be attempted for a reason that is
 *               not this row's fault: the feature is off, or the customer has
 *               no device registered. No attempt is counted, so turning push on
 *               later does not find a queue whose retries are already spent.
 *   'sent'    - Expo accepted it.
 *   'retry'   - a transport failure. Counted, backed off, dead after five.
 *
 * A TICKET IS NOT A DELIVERY. Expo answers `ok` when it has accepted the
 * message, and the real outcome arrives later in a receipt. This treats an
 * accepted ticket as sent on purpose: the receipt would need a second table and
 * a second job, and the only receipt error that changes what we STORE is
 * `DeviceNotRegistered`, which also arrives on the ticket for every case that
 * matters here. What is lost is delivery telemetry, not correctness.
 */

export type PushLegResult =
  | { outcome: 'none' }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'sent'; recipients: number }
  | { outcome: 'retry'; reason: string }

export type PushTargetRow = { expo_token: string; platform: string; locale: string }

/**
 * Android needs a channel to have been created by the app before a push can
 * carry a heads-up presentation. The app creates exactly this one.
 */
export const ANDROID_CHANNEL_ID = 'default'

export function toPushMessages(tokens: readonly string[], content: PushContent): ExpoPushMessage[] {
  return tokens.map((to) => ({
    to,
    title: content.title,
    body: content.body,
    data: content.data,
    sound: 'default',
    channelId: ANDROID_CHANNEL_ID,
    priority: 'high',
  }))
}

/**
 * Disables the tokens Expo reported as gone. Never deletes: the row, with its
 * reason, is the answer to "why did this customer stop getting notifications".
 */
export async function disableDeadTokens(
  admin: SupabaseClient,
  tokens: readonly string[],
  reason = 'DeviceNotRegistered',
): Promise<number> {
  if (tokens.length === 0) return 0
  const { error } = await admin
    .from('push_tokens')
    .update({ enabled: false, disabled_reason: reason })
    .in('expo_token', tokens as string[])
  return error ? 0 : tokens.length
}

export async function loadPushTargets(
  admin: SupabaseClient,
  userId: string | null,
  email: string | null,
): Promise<PushTargetRow[]> {
  const { data, error } = await admin.rpc('fn_push_targets', {
    p_user_id: userId,
    p_email: email,
  })
  if (error) return []
  return (data ?? []) as PushTargetRow[]
}

export async function pushOutboxRow(
  admin: SupabaseClient,
  row: {
    kind: string
    payload: Record<string, unknown> | null
    user_id: string | null
    recipient_email: string
  },
  siteUrl: string,
): Promise<PushLegResult> {
  const content = buildPushContent(row.kind, row.payload ?? {}, siteUrl)
  if (!content) return { outcome: 'none' }

  const targets = await loadPushTargets(admin, row.user_id, row.recipient_email)
  // A token column holding a device id or an emulator placeholder would make
  // Expo reject the WHOLE chunk, taking every valid token in it down with it.
  const tokens = targets.map((t) => t.expo_token).filter(isExpoPushToken)
  if (tokens.length === 0) return { outcome: 'skipped', reason: 'no registered device' }

  const result = await sendExpoPush(toPushMessages(tokens, content))

  if (!result.ok && result.skipped) return { outcome: 'skipped', reason: result.reason }
  if (!result.ok) return { outcome: 'retry', reason: result.reason }

  await disableDeadTokens(admin, result.invalidTokens)

  const accepted = result.tickets.filter((t) => t.status === 'ok').length
  if (accepted > 0) return { outcome: 'sent', recipients: accepted }

  // Every ticket errored. If they all errored because the devices are gone,
  // there is nothing left to retry against and the row is settled; anything
  // else is worth another attempt.
  const allDead = result.invalidTokens.length === tokens.length
  if (allDead) return { outcome: 'skipped', reason: 'every device unregistered' }

  const first = result.tickets.find((t) => t.status === 'error')
  return {
    outcome: 'retry',
    reason: first && first.status === 'error' ? first.message : 'no ticket accepted',
  }
}
