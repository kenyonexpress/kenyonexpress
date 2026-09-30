'use client'

import { BELL_PANEL_SIZE, type BellRow } from '@/lib/notifications/bell'
import { createClient } from '@/lib/supabase/client'
import { loadBell } from '@/server/actions/bell'
import { markNotificationRead } from '@/server/actions/notifications'
import { realtimeCredentials } from '@/server/actions/session'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * The in-app bell: what a signed-in customer has been told, live.
 *
 * The rows come from `public.notifications`, which is written ONLY by the
 * `outbox_bell_fanout` trigger (231, applied): every notification the platform
 * owes a customer passes through one `notification_outbox` INSERT, and the
 * trigger composes the Hebrew there, in the same transaction as the event.
 * This component therefore never composes copy; it renders `title_he` and
 * `body_he` as given.
 *
 * LIVENESS IS `postgres_changes`, AND THE SUBSCRIPTION IS REAL. 198's header
 * records the trap this feature was built around: a subscription against a
 * table missing from the `supabase_realtime` publication connects, reports
 * SUBSCRIBED, and receives nothing, forever, with no error on either side.
 * The table's membership and its REPLICA IDENTITY FULL are asserted by 231 on
 * every apply, and scripts/verify-bell-realtime.mjs proves the delivery path
 * end to end against production. RLS scopes events the same way it scopes the
 * initial SELECT: `user_id = auth.uid()`, evaluated by Realtime against the
 * subscriber's JWT.
 *
 * NOTHING RENDERS UNTIL THE SESSION IS CONFIRMED. The component returns null
 * until the first authenticated fetch lands, which keeps it out of the server
 * HTML entirely: no hydration mismatch on relative times, and a signed-out
 * render (this lives behind /account, but components move) shows nothing
 * rather than a dead bell.
 *
 * MARK-READ IS OPENING THE PANEL. The narrowest write the schema allows is the
 * one used: `UPDATE ... SET read_at` with no other columns (198 grants
 * authenticated exactly that column) and no explicit user filter, because RLS
 * is the filter. The update is optimistic; the UPDATE events that come back
 * through the channel reconcile any other open tab, and REPLICA IDENTITY FULL
 * means those events carry the OLD row too, so a tab can tell a fresh
 * read-transition from an echo.
 */

const PANEL_SIZE = BELL_PANEL_SIZE

/** Relative time in Hebrew for the panel rows; absolute date past a month. */
function relativeHe(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'עכשיו'
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 30) return rtf.format(-days, 'day')
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

export default function NotificationBell() {
  const [rows, setRows] = useState<BellRow[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let supabase: ReturnType<typeof createClient> | null = null
    let channel: RealtimeChannel | null = null

    const start = async () => {
      // Both reads are Server Actions: the session cookie is HttpOnly (STEP
      // 18), so the browser client below has no session of its own. It gets
      // the ACCESS token for the socket, never the refresh token.
      const creds = await realtimeCredentials()
      if (!creds || cancelled) return
      const snapshot = await loadBell()
      if (!snapshot || cancelled) return
      setRows(snapshot.rows)
      setUnread(snapshot.unread)
      setReady(true)

      supabase = createClient()
      supabase.realtime.setAuth(creds.accessToken)
      channel = supabase
        .channel(`bell:${creds.userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${creds.userId}`,
          },
          (payload) => {
            const row = payload.new as BellRow
            setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)].slice(0, PANEL_SIZE))
            if (!row.read_at) setUnread((n) => n + 1)
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${creds.userId}`,
          },
          (payload) => {
            const row = payload.new as BellRow
            const before = payload.old as Partial<BellRow>
            setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
            // Another tab marked it read. Only the null -> set transition
            // decrements, so an echo of our own optimistic update is inert.
            if (before.read_at === null && row.read_at !== null) {
              setUnread((n) => Math.max(0, n - 1))
            }
          },
        )
        .subscribe()
    }

    void start()
    return () => {
      cancelled = true
      if (supabase && channel) void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      const readAt = new Date().toISOString()
      setUnread(0)
      setRows((prev) => prev.map((r) => (r.read_at ? r : { ...r, read_at: readAt })))
      // `null` is "all of them"; RLS narrows it to this customer on the server.
      void markNotificationRead(null)
    }
  }

  if (!ready) return null

  return (
    <div ref={rootRef} className="account-bell">
      <button
        type="button"
        className="account-bell__button"
        aria-label={unread > 0 ? `התראות, ${unread} שלא נקראו` : 'התראות'}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell size={20} strokeWidth={1.8} aria-hidden="true" />
        {unread > 0 && (
          <span className="account-bell__badge" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <section className="account-bell__panel" aria-label="התראות אחרונות">
          {rows.length === 0 ? (
            <p className="account-bell__empty">
              אין התראות עדיין. עדכונים על הזמנות, קופונים וקאשבק יופיעו כאן.
            </p>
          ) : (
            <ul className="account-bell__list">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.href ?? '/account'}
                    className="account-bell__item"
                    onClick={() => setOpen(false)}
                  >
                    <span className="account-bell__title">{row.title_he}</span>
                    {row.body_he && <span className="account-bell__body">{row.body_he}</span>}
                    <span className="account-bell__time">{relativeHe(row.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
