import 'server-only'

import {
  type Category,
  type CategoryCount,
  type KindExclusion,
  categoryOf,
  countByCategory,
  kindExclusion,
  mutedCategories,
} from '@/lib/notifications/categories'
import { applyKindExclusion } from '@/lib/notifications/kind-filter'
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
 *
 * MUTES ARE APPLIED HERE, AT READ TIME (STEP 49). The trigger that writes the
 * rows reads no preference, so every reader narrows by `kindExclusion` over
 * the customer's preference rows. The bell's action does the same; the two
 * share the predicate in lib/notifications/kind-filter.ts.
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

function toNotification(row: Record<string, unknown>): InAppNotification {
  return {
    id: String(row.id),
    kind: String(row.kind),
    titleHe: String(row.title_he),
    bodyHe: (row.body_he as string | null) ?? null,
    href: (row.href as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: String(row.created_at),
  }
}

/** The newest notifications for the signed-in customer, unread ones included. */
export async function loadNotifications(limit = 20): Promise<InAppNotification[]> {
  const supabase = await createClient()
  const exclusion = kindExclusion(await loadPreferences())
  const { data, error } = await applyKindExclusion(
    supabase
      .from('notifications' as never)
      .select('id, kind, title_he, body_he, href, read_at, created_at'),
    exclusion,
  )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissing(error)) reportAbsence()
    else log.warn('notifications.read_failed', { reason: error.message })
    return []
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toNotification)
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
  const exclusion = kindExclusion(await loadPreferences())
  const { count, error } = await applyKindExclusion(
    supabase.from('notifications' as never).select('id', { count: 'exact', head: true }),
    exclusion,
  ).is('read_at', null)

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

/** How many rows the center lists per tab; past that, the newest win. */
export const CENTER_PAGE_SIZE = 50

/**
 * How many rows the per-tab counters look back over. The counters are drawn
 * from the kinds of the newest rows, in one read, instead of one HEAD count
 * per shelf; a customer whose unread rows are older than this is one whose
 * tab counters read "50+", which is still the truth.
 */
export const CENTER_COUNT_WINDOW = 500

export interface NotificationCenter {
  /** The rows on the selected tab, newest first, muted shelves excluded. */
  rows: InAppNotification[]
  /** Per-shelf totals, every shelf present even at zero. */
  counts: Record<Category, CategoryCount>
  /** Unread across every shelf that is not muted. */
  unread: number
  /** Which shelves the customer has muted. */
  muted: Category[]
  /** The preference rows, so the page can hand them to the switch matrix. */
  preferences: PreferenceRow[]
  /** What the in-app surface is hiding, for anything client-side that filters. */
  exclusion: KindExclusion
}

const EMPTY_CENTER = (preferences: PreferenceRow[]): NotificationCenter => ({
  rows: [],
  counts: countByCategory([]),
  unread: 0,
  muted: mutedCategories(preferences),
  preferences,
  exclusion: kindExclusion(preferences),
})

/**
 * Everything the center page renders, in two reads: the preferences, then
 * one window of recent rows. The selected tab is cut from that window in
 * TypeScript rather than with a second query, so the counters and the list
 * are drawn from the same rows and cannot disagree.
 */
export async function loadNotificationCenter(
  category: Category | null,
): Promise<NotificationCenter> {
  const supabase = await createClient()
  const preferences = await loadPreferences()
  const exclusion = kindExclusion(preferences)

  const { data, error } = await applyKindExclusion(
    supabase
      .from('notifications' as never)
      .select('id, kind, title_he, body_he, href, read_at, created_at'),
    exclusion,
  )
    .order('created_at', { ascending: false })
    .limit(CENTER_COUNT_WINDOW)

  if (error) {
    if (isMissing(error)) reportAbsence()
    else log.warn('notifications.center_read_failed', { reason: error.message })
    return EMPTY_CENTER(preferences)
  }

  const window = ((data ?? []) as Record<string, unknown>[]).map(toNotification)
  const counts = countByCategory(window.map((r) => ({ kind: r.kind, read_at: r.readAt })))
  const unread = window.filter((r) => !r.readAt).length

  // The selected shelf. `categoryOf` and `applyCategoryFilter` (the mark-all
  // write's predicate) read the same kind lists, so "mark this tab read" and
  // "what this tab shows" agree by construction; kind-filter.test.ts pins it.
  const rows = category ? window.filter((r) => categoryOf(r.kind) === category) : window

  return {
    rows: rows.slice(0, CENTER_PAGE_SIZE),
    counts,
    unread,
    muted: mutedCategories(preferences),
    preferences,
    exclusion,
  }
}
