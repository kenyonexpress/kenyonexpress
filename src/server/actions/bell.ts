'use server'

import { BELL_PANEL_SIZE, type BellRow } from '@/lib/notifications/bell'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/**
 * The account bell's first paint: the newest rows and the unread count.
 *
 * Read here, under RLS on the request-scoped client, because the browser
 * client that used to read them has no session since the cookie went
 * HttpOnly (STEP 18, lib/auth/session-cookie.ts). The live INSERT/UPDATE
 * stream still arrives over Realtime in the browser, authenticated with the
 * access token from `realtimeCredentials` (server/actions/session.ts).
 */

export type { BellRow }

export type BellSnapshot = { rows: BellRow[]; unread: number } | null

/** Postgres undefined_table, and PostgREST's schema-cache equivalent (198 unapplied). */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

async function runLoadBell(): Promise<BellSnapshot> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('notifications' as never)
    .select('id,kind,title_he,body_he,href,read_at,created_at')
    .order('created_at', { ascending: false })
    .limit(BELL_PANEL_SIZE)
  if (error) {
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('notifications.bell_read_failed', { reason: error.message })
    }
    return { rows: [], unread: 0 }
  }

  // The badge counts ALL unread, not unread-within-the-panel: a customer who
  // was away long enough to bury an unread row under fifteen newer ones is
  // exactly the customer the number is for.
  const { count } = await supabase
    .from('notifications' as never)
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  return { rows: (data as unknown as BellRow[] | null) ?? [], unread: count ?? 0 }
}

export async function loadBell(): Promise<BellSnapshot> {
  return withActionContext('notifications.bell_load', () => runLoadBell())
}
