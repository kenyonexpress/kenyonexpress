'use client'

import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyRealtimeRow, markRowsRead, sortNotifications, unreadCount } from './feed'
import type { NotificationAudience, NotificationFeed, NotificationRow } from './types'

/**
 * The bell's data: one page of notifications, kept live over Supabase Realtime.
 *
 * WHY REALTIME AND NOT POLLING. A supplier standing at a counter needs to know
 * about an order now, and polling that is fast enough to feel live is a request
 * per second per open tab against a database that is also serving the shop. The
 * socket costs one connection and delivers in the same breath as the COMMIT.
 *
 * WHAT THE SUBSCRIPTION IS ACTUALLY FILTERED BY. Three separate things, and it
 * matters that they are three:
 *
 *   1. **RLS**, which decides what the socket is allowed to carry. Realtime
 *      re-evaluates the SELECT policy from `088` per subscriber, so another
 *      customer's row never reaches this browser at all. This is the security
 *      boundary and it is the only one.
 *   2. **The server-side `filter`** below, which narrows the stream to one
 *      audience so a busy platform does not push every row to every socket.
 *      It is an optimisation, not a guard.
 *   3. **`belongsToFeed`** in the reducer, which decides what this component
 *      renders. A supplier member legitimately receives rows for two audiences
 *      and only one of them belongs in this bell.
 *
 * WHY UPDATES ARE SUBSCRIBED TO AND NOT ONLY INSERTS. "Mark all read" on a
 * phone must clear the badge on the laptop. That is an UPDATE, and it is the
 * reason `088` sets REPLICA IDENTITY FULL: without it the old row arrives as a
 * bare primary key and Realtime cannot evaluate RLS against it, so the event is
 * dropped and the two tabs disagree forever.
 *
 * THE UNREAD COUNT IS DERIVED, NEVER STORED. A counter kept beside the list is
 * a second source of truth that drifts the first time an event is missed. It is
 * recomputed from the rows on every render, which is a loop over at most
 * `limit` items.
 */

export interface UseNotificationFeedOptions {
  audience: NotificationAudience | null
  /** How many rows the bell holds. The panel is a preview, not an archive. */
  limit?: number
  /** Test seam. Never passed by application code. */
  client?: ReturnType<typeof createClient>
}

export interface NotificationFeedApi extends NotificationFeed {
  markRead: (ids?: readonly string[]) => Promise<void>
  refresh: () => Promise<void>
}

const DEFAULT_LIMIT = 20

export function useNotificationFeed(options: UseNotificationFeedOptions): NotificationFeedApi {
  const { audience, limit = DEFAULT_LIMIT } = options

  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState<boolean>(audience !== null)
  const [error, setError] = useState<string | null>(null)

  const injected = options.client
  // One client for the life of the component. `createClient()` in the render
  // body would build a new browser client on every state change, and the
  // effect below would tear the socket down and open a new one each time.
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null)
  if (clientRef.current === null) {
    clientRef.current = injected ?? createClient()
  }
  const client = clientRef.current

  // The audience is an object literal at every call site, so a dependency on it
  // by reference re-runs the effect on every render. The key is its identity.
  const audienceKey = audience
    ? audience.scope === 'user'
      ? `user:${audience.userId}`
      : `supplier:${audience.supplierId}`
    : null

  const audienceRef = useRef(audience)
  audienceRef.current = audience

  const load = useCallback(async () => {
    const current = audienceRef.current
    if (!current) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    const query = client
      .from('notifications')
      .select('id, user_id, supplier_id, kind, title_he, body_he, href, data, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    const scoped =
      current.scope === 'user'
        ? query.eq('user_id', current.userId)
        : query.eq('supplier_id', current.supplierId)

    const { data, error: readError } = await scoped

    if (readError) {
      // Rendered as a line in the panel, not thrown. A header that crashes
      // because a notification query failed takes the whole site with it.
      setError(readError.message)
      setLoading(false)
      return
    }

    setError(null)
    setRows(sortNotifications((data ?? []) as unknown as NotificationRow[]))
    setLoading(false)
  }, [client, limit])

  useEffect(() => {
    if (audienceKey === null) {
      setRows([])
      setLoading(false)
      return
    }

    let active = true
    void load().then(() => {
      if (!active) return
    })

    const current = audienceRef.current
    if (!current) return

    const filter =
      current.scope === 'user'
        ? `user_id=eq.${current.userId}`
        : `supplier_id=eq.${current.supplierId}`

    const channel = client
      .channel(`notifications:${audienceKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter },
        (payload: { new?: unknown }) => {
          const incoming = payload.new as NotificationRow | undefined
          const target = audienceRef.current
          if (!incoming || !target) return
          setRows((previous) => applyRealtimeRow(previous, incoming, target, limit))
        },
      )
      .subscribe()

    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [audienceKey, client, limit, load])

  const markRead = useCallback(
    async (ids?: readonly string[]) => {
      const target = ids ?? null
      const at = new Date().toISOString()

      // Optimistic, and deliberately not rolled back on failure. The row is
      // still unread in the database and the next load shows it again; undoing
      // it under the reader's finger is the worse of the two wrongs.
      setRows((previous) => markRowsRead(previous, target, at))

      const { error: rpcError } = await client.rpc('fn_mark_notifications_read', {
        p_ids: target === null ? null : [...target],
      })
      if (rpcError) setError(rpcError.message)
    },
    [client],
  )

  const unread = useMemo(() => unreadCount(rows), [rows])

  return { rows, unread, loading, error, markRead, refresh: load }
}
