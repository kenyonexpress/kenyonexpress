import 'server-only'

import { log } from '@/lib/observability/log'
import { deviceLabel } from '@/lib/push/device-label'
import { isMissingPushRelation } from '@/lib/push/store'
import { createClient } from '@/lib/supabase/server'

/**
 * The browsers this account receives push in: every row of
 * `push_subscriptions` the caller owns, for the list on /account/notifications.
 *
 * READ THROUGH THE REQUEST-SCOPED CLIENT, NOT THE ADMIN ONE. 179 grants
 * `push_subscriptions_select_own` (`auth.uid() = user_id`), so the session is
 * the filter, the same rule as notifications.ts and for the same reason: a
 * `.eq('user_id', ...)` written in TypeScript is the line that one day gets
 * forgotten and shows one customer another customer's devices.
 *
 * WHAT LEAVES THE SERVER. The endpoint is included so the client component can
 * tell which row is the browser it is running in; it belongs to the caller and
 * RLS already lets them read it. The two encryption keys are not selected at
 * all, because nothing on a page needs them.
 *
 * A missing table (179 on a preview branch) is an empty list, not an error:
 * the page must render with no devices, which is also the honest answer.
 */

export interface PushDevice {
  id: string
  endpoint: string
  /** "Chrome, Android": derived from the stored user agent, never the raw string. */
  label: string
  createdAt: string
  updatedAt: string
}

export async function loadPushSubscriptions(): Promise<PushDevice[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('push_subscriptions' as never)
    .select('id, endpoint, user_agent, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    if (!isMissingPushRelation(error)) {
      log.warn('push.subscriptions_read_failed', { reason: error.message })
    }
    return []
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    endpoint: String(row.endpoint),
    label: deviceLabel((row.user_agent as string | null) ?? null),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }))
}
