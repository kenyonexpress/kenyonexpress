import 'server-only'

import type { Channel, PreferenceRow } from '@/lib/notifications/preferences'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/**
 * Reading the bell and the settings behind it, and surviving 198's absence.
 *
 * `migrations/pending/198_in_app_notifications.sql` is written and not applied,
 * which is the standing rule. Until it lands both tables are missing, every
 * read below returns the empty answer, and the bell renders with no badge --
 * which is exactly what a customer with no notifications should see. Nothing
 * throws and no page 500s over a migration nobody has approved.
 *
 * READ THROUGH THE REQUEST-SCOPED CLIENT, NOT THE ADMIN ONE. The RLS policy is
 * `user_id = auth.uid()`, so the session IS the filter. Reading through the
 * service role and adding `.eq('user_id', …)` in TypeScript would move that
 * filter into application code, where forgetting it once shows one customer
 * another customer's notifications.
 */

/** Postgres and PostgREST for "that table is not there". */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

let absenceReported = false

function isMissing(error: { code?: string | null } | null): boolean {
  return Boolean(error?.code && MISSING_TABLE.has(error.code))
}

function reportAbsence(): void {
  if (absenceReported) return
  absenceReported = true
  log.warn('notifications.tables_absent', {
    detail: '198 is written and unapplied; the bell reads empty.',
  })
}

export interface InAppNotification {
  id: string
  kind: string
  titleHe: string
  bodyHe: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

/** The newest notifications for the signed-in customer, unread ones included. */
export async function loadNotifications(limit = 20): Promise<InAppNotification[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications' as never)
    .select('id, kind, title_he, body_he, href, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissing(error)) reportAbsence()
    else log.warn('notifications.read_failed', { reason: error.message })
    return []
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    kind: String(row.kind),
    titleHe: String(row.title_he),
    bodyHe: (row.body_he as string | null) ?? null,
    href: (row.href as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: String(row.created_at),
  }))
}

/**
 * How many are unread.
 *
 * A HEAD count rather than fetching the rows and measuring the array: the badge
 * needs a number, and a customer with two hundred unread notifications should
 * not transfer two hundred rows to render "200".
 */
export async function unreadCount(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('notifications' as never)
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  if (error) {
    if (isMissing(error)) reportAbsence()
    else log.warn('notifications.count_failed', { reason: error.message })
    return 0
  }
  return count ?? 0
}

/** The stored opt-outs. An empty list means "nothing decided", not "all off". */
export async function loadPreferences(): Promise<PreferenceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notification_preferences' as never)
    .select('kind, channel, enabled')

  if (error) {
    if (isMissing(error)) reportAbsence()
    else log.warn('notifications.preferences_read_failed', { reason: error.message })
    return []
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    kind: String(row.kind),
    channel: String(row.channel) as Channel,
    enabled: row.enabled !== false,
  }))
}
