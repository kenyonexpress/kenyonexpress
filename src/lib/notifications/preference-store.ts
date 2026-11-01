import type { PreferenceRow } from '@/lib/notifications/preferences'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reading `notification_preferences` from the SENDING side.
 *
 * WHAT WAS MEASURED, 2026-09-09. The account settings page writes this table
 * and nothing reads it. `mayNotify` is called in exactly two places: by
 * `preferenceMatrix`, to draw the switches, and by that page's own tests. No
 * sender consults it - not the email leg of `/api/cron/notifications`, not the
 * push leg, not `fn_push_targets`, whose whole body is `WHERE t.enabled`.
 *
 * So the switches were decorative. A customer could turn "ההזמנה נשלחה" off in
 * all four channels, see it saved, and keep receiving it - which is worse than
 * having no setting at all, and is the exact failure `preferences.ts` names in
 * its own header as the reason operator kinds are refused rather than silently
 * defaulted.
 *
 * WHY THE READER LIVES HERE AND NOT IN `preferences.ts`. That file is pure: it
 * decides, given rows, and it is imported by client components that must not
 * pull a Supabase client into the bundle. This one does IO and is server-only.
 *
 * AN ABSENT TABLE MEANS "NO OPINION RECORDED", NOT "SEND NOTHING". The rows are
 * defaults-on by design, so failing open is the same answer the empty table
 * gives. Failing closed would silence every optional notification for everybody
 * the first time a schema cache went stale.
 */

/** Postgres undefined_table, and PostgREST's schema-cache equivalent. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export async function loadPreferenceRows(
  admin: SupabaseClient,
  userId: string | null,
): Promise<PreferenceRow[]> {
  // No user is not an anonymous customer with preferences; it is an operator
  // alert or an order placed by a guest. Neither has a settings page.
  if (!userId) return []

  const { data, error } = await admin
    .from('notification_preferences' as never)
    .select('kind, channel, enabled')
    .eq('user_id', userId)

  if (error) {
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('notifications.preferences_read_failed', { reason: error.message })
    }
    return []
  }

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    kind: String(row.kind ?? ''),
    channel: row.channel as PreferenceRow['channel'],
    enabled: row.enabled === true,
  }))
}
