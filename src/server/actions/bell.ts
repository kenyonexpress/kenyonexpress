'use server'

import { BELL_PANEL_SIZE, type BellRow } from '@/lib/notifications/bell'
import {
  type Category,
  type KindExclusion,
  NO_EXCLUSION,
  kindExclusion,
  mutedCategories,
} from '@/lib/notifications/categories'
import { applyKindExclusion } from '@/lib/notifications/kind-filter'
import type { PreferenceRow } from '@/lib/notifications/preferences'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/**
 * The account bell's first paint: the newest rows, the unread count, and
 * what the customer has muted.
 *
 * Read here, under RLS on the request-scoped client, because the browser
 * client that used to read them has no session since the cookie went
 * HttpOnly (STEP 18, lib/auth/session-cookie.ts). The live INSERT/UPDATE
 * stream still arrives over Realtime in the browser, authenticated with the
 * access token from `realtimeCredentials` (server/actions/session.ts).
 *
 * THE MUTES RIDE ALONG (STEP 49). The trigger writes every row regardless of
 * preference, so hiding a muted category is the reader's job, in three
 * places that must agree: the rows below, the badge count below, and the
 * realtime INSERT handler in the component, which gets the same exclusion
 * shape and applies `isKindVisible` to each event before it moves the UI.
 */

export type { BellRow }

export type BellSnapshot = {
  rows: BellRow[]
  unread: number
  exclusion: KindExclusion
  muted: Category[]
} | null

/** Postgres undefined_table, and PostgREST's schema-cache equivalent (198 unapplied). */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

async function runLoadBell(): Promise<BellSnapshot> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Preferences first: the two reads that follow are narrowed by them. A
  // failed or absent table is "nothing muted", the same answer an empty
  // table gives, so the bell never goes dark over a preferences hiccup.
  const prefs = await supabase
    .from('notification_preferences' as never)
    .select('kind, channel, enabled')
  const prefRows: PreferenceRow[] =
    prefs.error || !prefs.data ? [] : (prefs.data as unknown as PreferenceRow[])
  const exclusion = prefRows.length ? kindExclusion(prefRows) : NO_EXCLUSION
  const muted = mutedCategories(prefRows)

  const { data, error } = await applyKindExclusion(
    supabase
      .from('notifications' as never)
      .select('id,kind,title_he,body_he,href,read_at,created_at'),
    exclusion,
  )
    .order('created_at', { ascending: false })
    .limit(BELL_PANEL_SIZE)
  if (error) {
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('notifications.bell_read_failed', { reason: error.message })
    }
    return { rows: [], unread: 0, exclusion, muted }
  }

  // The badge counts ALL unread, not unread-within-the-panel: a customer who
  // was away long enough to bury an unread row under fifteen newer ones is
  // exactly the customer the number is for.
  const { count } = await applyKindExclusion(
    supabase.from('notifications' as never).select('id', { count: 'exact', head: true }),
    exclusion,
  ).is('read_at', null)

  return {
    rows: (data as unknown as BellRow[] | null) ?? [],
    unread: count ?? 0,
    exclusion,
    muted,
  }
}

export async function loadBell(): Promise<BellSnapshot> {
  return withActionContext('notifications.bell_load', () => runLoadBell())
}
