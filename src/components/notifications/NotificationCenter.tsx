'use client'

import { formatDateTime } from '@/lib/account/format'
import {
  CATEGORIES,
  CATEGORY_LABEL_HE,
  type Category,
  type CategoryCount,
  categoryOf,
} from '@/lib/notifications/categories'
import { markAllNotificationsRead, markNotificationRead } from '@/server/actions/notifications'
import type { InAppNotification } from '@/server/queries/notifications'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The notifications center: one list, four shelves, one button.
 *
 * THE TABS ARE LINKS, NOT STATE. `?category=orders` is the selected shelf, so
 * the page is server-rendered per tab, a reload lands on the same tab, and
 * the bell's footer can deep-link to a shelf. The counters beside each tab
 * come from the server (`loadNotificationCenter`) and are the unread on that
 * shelf, muted shelves included at zero so a muted tab reads as muted and not
 * as empty.
 *
 * MARK-ALL IS THE TAB'S SCOPE. On "all" it clears every shelf; on a shelf it
 * clears that shelf only, through the same predicate the server lists it by.
 * Optimistic on the rows in hand, then `router.refresh()` so the counters and
 * the bell's next paint read the database rather than this component's guess.
 *
 * A ROW CLICK MARKS THAT ROW. Fire-and-forget through the existing single-id
 * action; the navigation is the point and the write must not delay it.
 */

export interface NotificationCenterProps {
  rows: InAppNotification[]
  counts: Record<Category, CategoryCount>
  selected: Category | null
  muted: Category[]
}

function tabHref(category: Category | null): string {
  return category ? `/account/notifications?category=${category}` : '/account/notifications'
}

export default function NotificationCenter({
  rows: initialRows,
  counts,
  selected,
  muted,
}: NotificationCenterProps) {
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const unreadHere = rows.filter((r) => !r.readAt).length
  const allUnread = CATEGORIES.reduce((n, c) => n + counts[c].unread, 0)
  const scopeUnread = selected ? counts[selected].unread : allUnread
  const isMuted = selected !== null && muted.includes(selected)

  const markAll = () => {
    setError(null)
    const readAt = new Date().toISOString()
    setRows((prev) => prev.map((r) => (r.readAt ? r : { ...r, readAt })))
    start(async () => {
      const result = await markAllNotificationsRead(selected)
      if (!result.ok) {
        setRows(initialRows)
        setError(result.error ?? 'העדכון נכשל.')
        return
      }
      router.refresh()
    })
  }

  const markOne = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id && !r.readAt ? { ...r, readAt: new Date().toISOString() } : r)),
    )
    void markNotificationRead(id)
  }

  return (
    <section className="account-card notification-center" aria-labelledby="notification-center-h">
      <div className="notification-center__head">
        <h2 id="notification-center-h" className="account-card__title">
          ההתראות שלך
        </h2>
        <button
          type="button"
          className="account-btn"
          onClick={markAll}
          disabled={pending || (scopeUnread === 0 && unreadHere === 0)}
        >
          {selected ? `סמן את ${CATEGORY_LABEL_HE[selected]} כנקרא` : 'סמן הכל כנקרא'}
        </button>
      </div>

      <nav className="account-tabs" aria-label="קטגוריות התראות">
        <Link
          href={tabHref(null)}
          className={`account-tabs__link${selected === null ? ' is-active' : ''}`}
          aria-current={selected === null ? 'page' : undefined}
        >
          הכל
          {allUnread > 0 && <span className="account-tabs__count">{allUnread}</span>}
        </Link>
        {CATEGORIES.map((category) => (
          <Link
            key={category}
            href={tabHref(category)}
            className={`account-tabs__link${selected === category ? ' is-active' : ''}`}
            aria-current={selected === category ? 'page' : undefined}
          >
            {CATEGORY_LABEL_HE[category]}
            {muted.includes(category) ? (
              <span className="account-tabs__count">מושתק</span>
            ) : (
              counts[category].unread > 0 && (
                <span className="account-tabs__count">{counts[category].unread}</span>
              )
            )}
          </Link>
        ))}
      </nav>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {isMuted ? (
        <p className="account-empty">
          הקטגוריה הזו מושתקת. ההתראות שלה נשמרות ויופיעו כאן כשתבטלו את ההשתקה למטה.
        </p>
      ) : rows.length === 0 ? (
        <p className="account-empty">
          אין התראות {selected ? `ב${CATEGORY_LABEL_HE[selected]}` : 'עדיין'}. עדכונים על הזמנות,
          מבצעים והחשבון יופיעו כאן.
        </p>
      ) : (
        <ul className="notification-list">
          {rows.map((row) => (
            <li key={row.id} className={`notification-list__item${row.readAt ? '' : ' is-unread'}`}>
              <Link
                href={row.href ?? '/account'}
                className="notification-list__link"
                onClick={() => markOne(row.id)}
              >
                <span className="notification-list__title">
                  {!row.readAt && <span className="notification-list__dot" aria-label="לא נקרא" />}
                  {row.titleHe}
                </span>
                {row.bodyHe && <span className="notification-list__body">{row.bodyHe}</span>}
                <span className="notification-list__meta">
                  <span className="account-chip account-chip--default">
                    {CATEGORY_LABEL_HE[categoryOf(row.kind)]}
                  </span>
                  {formatDateTime(row.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
