'use client'

import { requireAnonKey } from '@/lib/supabase/anon-key'
import { markNotificationRead } from '@/server/actions/notifications'
import { createBrowserClient } from '@supabase/ssr'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * The bell, its badge, and why the badge is correct even when realtime is not.
 *
 * THE COUNT ARRIVES FROM THE SERVER FIRST. `initialUnread` is rendered by the
 * page, so the badge is right on the first paint and stays right across every
 * navigation, with no client round trip and no flash of an empty bell.
 *
 * REALTIME IS AN ENHANCEMENT, AND IT IS TREATED AS ONE. Measured 2026-09-09:
 * `supabase_realtime` contains ZERO tables, so a `postgres_changes`
 * subscription connects, reports SUBSCRIBED, and receives nothing -- with no
 * error on either side. `migrations/pending/198` adds `notifications` to the
 * publication, and until it is applied this subscription is inert.
 *
 * That is the whole reason the count is not fetched here. A bell whose badge
 * came only from a live subscription would read zero forever, for everyone, and
 * look like a working feature with nothing to show.
 *
 * The filter is `user_id=eq.<id>` and it is not the security boundary -- RLS is.
 * Supabase evaluates the filter against the WAL record, so a subscription
 * without it would receive nothing anyway once RLS is applied; it is there to
 * avoid waking every client for every row.
 */

export default function NotificationBell({
  userId,
  initialUnread,
}: {
  userId: string
  initialUnread: number
}) {
  const [unread, setUnread] = useState(initialUnread)

  // The server's number wins on every navigation. Without this the badge would
  // keep a stale client count after the customer read something on another tab.
  useEffect(() => setUnread(initialUnread), [initialUnread])

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      requireAnonKey(),
    )

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => setUnread((n) => n + 1),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  return (
    <Link
      href="/account/notifications"
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5"
      // The count is in the accessible name, not only in the badge: a screen
      // reader user gets "התראות, 3 חדשות" rather than a bell and a number
      // announced as separate, orderless things.
      aria-label={unread > 0 ? `התראות, ${unread} חדשות` : 'התראות'}
      onClick={() => {
        // Optimistic only. The page re-renders with the server's number on
        // arrival, so a failed mark-read corrects itself rather than leaving a
        // badge that is permanently wrong in the flattering direction.
        if (unread > 0) void markNotificationRead(null)
      }}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 && (
        <span
          className="absolute end-1 top-1 min-w-4 rounded-full bg-price px-1 text-center text-[0.625rem] font-bold text-white"
          aria-hidden="true"
        >
          {/* Capped, because a three-digit badge stops being a badge. */}
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
