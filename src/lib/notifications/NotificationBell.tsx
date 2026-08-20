'use client'

import { Bell } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { badgeText, bellLabel, formatRelativeHebrew } from './feed'
import type { NotificationAudience, NotificationRow } from './types'
import { useNotificationFeed } from './use-notification-feed'

/**
 * The bell in the header, and the panel that hangs off it.
 *
 * RTL by default and Hebrew throughout, per the project's UI rule. Every
 * inset is a logical property (`ps`/`pe`, `start`/`end`), so the panel opens
 * under the icon on the correct side without a single `dir` check in
 * JavaScript.
 *
 * THE RELATIVE TIME IS NOT COMPUTED DURING RENDER ON THE SERVER. `now` starts
 * at zero and is set in an effect, which means the first paint shows no
 * timestamps and the second shows them all. That is deliberate:
 * `formatRelativeHebrew(iso, Date.now())` evaluated on the server and again in
 * the browser produces two different strings a few hundred milliseconds apart,
 * and React calls that a hydration mismatch and throws away the tree.
 *
 * MARKING READ HAPPENS ON OPEN, NOT ON CLICK. Opening the panel is the act of
 * reading; requiring a click on each row to clear a badge trains people to
 * ignore the badge. Individual rows stay clickable because `href` is where the
 * notification is actually about.
 */

export interface NotificationBellProps {
  audience: NotificationAudience | null
  /** Rows the panel holds. The panel is a preview, not an archive. */
  limit?: number
  /** Where "כל ההתראות" points, when a full page exists for this audience. */
  allHref?: string
}

export default function NotificationBell({ audience, limit, allHref }: NotificationBellProps) {
  const { rows, unread, loading, error, markRead } = useNotificationFeed({ audience, limit })
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    // A panel left open should not freeze its timestamps at "עכשיו" forever.
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Nothing to show and nothing to subscribe to: a signed-out visitor gets no
  // bell rather than an empty one that never fills.
  if (!audience) return null

  const badge = badgeText(unread)

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) void markRead()
  }

  return (
    <div className="relative" ref={containerRef} dir="rtl">
      <button
        type="button"
        onClick={toggle}
        aria-label={bellLabel(unread)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-neutral-800 transition-colors hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800"
      >
        <Bell size={20} aria-hidden="true" />
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 start-0 min-w-5 rounded-full bg-[#fed700] px-1 text-center text-[11px] font-bold leading-5 text-neutral-900 tabular-nums"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="התראות"
          dir="rtl"
          className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <span className="text-sm font-bold text-neutral-900">התראות</span>
            {allHref ? (
              <Link
                href={allHref}
                className="text-xs font-semibold text-neutral-600 underline hover:text-neutral-900"
                onClick={() => setOpen(false)}
              >
                כל ההתראות
              </Link>
            ) : null}
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {loading && rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">טוען התראות...</p>
            ) : null}

            {error ? (
              <p className="px-4 py-6 text-center text-sm text-red-600">
                לא הצלחנו לטעון את ההתראות. נסו שוב בעוד רגע.
              </p>
            ) : null}

            {!loading && !error && rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">אין התראות חדשות</p>
            ) : null}

            <ul className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <NotificationItem
                  key={row.id}
                  row={row}
                  now={now}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NotificationItem({
  row,
  now,
  onNavigate,
}: {
  row: NotificationRow
  now: number
  onNavigate: () => void
}) {
  const unread = row.read_at === null
  const when = now === 0 ? '' : formatRelativeHebrew(row.created_at, now)

  const body = (
    <>
      <span className="flex items-start gap-2">
        {unread ? (
          <span
            aria-hidden="true"
            className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[#fed700]"
          />
        ) : (
          <span aria-hidden="true" className="mt-1.5 inline-block h-2 w-2 shrink-0" />
        )}
        <span className="text-sm font-bold text-neutral-900">{row.title_he}</span>
      </span>
      {row.body_he ? (
        <span className="mt-0.5 block ps-4 text-sm text-neutral-600">{row.body_he}</span>
      ) : null}
      {when ? (
        <span className="mt-1 block ps-4 text-xs text-neutral-400">{when}</span>
      ) : null}
    </>
  )

  return (
    <li>
      {row.href ? (
        <Link
          href={row.href}
          role="menuitem"
          onClick={onNavigate}
          className="block px-4 py-3 text-start transition-colors hover:bg-neutral-50"
        >
          {body}
        </Link>
      ) : (
        <div className="block px-4 py-3 text-start">{body}</div>
      )}
    </li>
  )
}
