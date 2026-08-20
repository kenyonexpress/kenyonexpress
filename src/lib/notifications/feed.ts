import type { NotificationAudience, NotificationRow } from './types'

/**
 * The pure half of the bell: everything that decides what a row looks like and
 * whether it belongs here, with no React, no Supabase and no clock of its own.
 *
 * It is separate from the hook for the usual reason and one specific one. The
 * usual reason is that this is where the bugs live and a pure function is where
 * they can be tested. The specific one is `belongsToFeed`: Realtime delivers an
 * INSERT to every subscriber on the channel, RLS decides what a socket may
 * carry but not what a component should render, and a supplier member subscribed
 * to both feeds will receive rows for both. Deciding that in the hook means
 * deciding it inside a subscription callback, which is the one place nobody
 * ever writes a test for.
 */

/** Newest first, and stable: two rows written in the same millisecond keep a fixed order. */
export function sortNotifications(rows: readonly NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => {
    if (a.created_at === b.created_at) return a.id.localeCompare(b.id)
    return a.created_at < b.created_at ? 1 : -1
  })
}

export function unreadCount(rows: readonly NotificationRow[]): number {
  return rows.reduce((count, row) => (row.read_at === null ? count + 1 : count), 0)
}

/** Whether a row Realtime just delivered is one this feed should show. */
export function belongsToFeed(row: NotificationRow, audience: NotificationAudience): boolean {
  if (audience.scope === 'user') return row.user_id === audience.userId
  return row.supplier_id === audience.supplierId
}

/**
 * Fold one Realtime event into the list.
 *
 * IT DEDUPLICATES BY ID, and that is not defensive coding. Between the initial
 * fetch and the moment the socket is subscribed there is a window, and a row
 * written inside it arrives twice: once in the page the fetch returned, once as
 * an INSERT the subscription replays. Appending blindly puts the same coupon in
 * the bell twice.
 *
 * An UPDATE for a row that is not held is treated as an insert. That is the
 * "read on another tab, for a row this tab never loaded" case, and dropping it
 * would leave the count wrong until a reload.
 */
export function applyRealtimeRow(
  rows: readonly NotificationRow[],
  incoming: NotificationRow,
  audience: NotificationAudience,
  limit: number,
): NotificationRow[] {
  if (!belongsToFeed(incoming, audience)) return rows as NotificationRow[]

  const without = rows.filter((row) => row.id !== incoming.id)
  return sortNotifications([incoming, ...without]).slice(0, limit)
}

export function markRowsRead(
  rows: readonly NotificationRow[],
  ids: readonly string[] | null,
  at: string,
): NotificationRow[] {
  const wanted = ids === null ? null : new Set(ids)
  return rows.map((row) => {
    if (row.read_at !== null) return row
    if (wanted !== null && !wanted.has(row.id)) return row
    return { ...row, read_at: at }
  })
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Hebrew relative time, to the coarsest unit that is still true.
 *
 * `now` is a parameter and not `Date.now()` so this is testable and so a server
 * render and the hydration that follows it cannot disagree — a relative
 * timestamp computed twice a few hundred milliseconds apart is a classic
 * hydration mismatch.
 *
 * A future timestamp reads as "עכשיו". Clocks disagree by seconds between a
 * database and a browser, and "בעוד 30 שניות" on a notification that has
 * already happened reads as a bug to the person holding the phone.
 */
export function formatRelativeHebrew(iso: string, now: number): string {
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return ''

  const elapsed = now - at
  if (elapsed < MINUTE) return 'עכשיו'

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE)
    return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דקות`
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR)
    if (hours === 1) return 'לפני שעה'
    if (hours === 2) return 'לפני שעתיים'
    return `לפני ${hours} שעות`
  }

  const days = Math.floor(elapsed / DAY)
  if (days === 1) return 'אתמול'
  if (days === 2) return 'לפני יומיים'
  if (days < 30) return `לפני ${days} ימים`

  return new Date(at).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * The accessible label for the bell itself.
 *
 * A screen reader user gets the count from here and from nowhere else: the
 * badge is a decorative number and is marked `aria-hidden`, because read aloud
 * on its own it is just "3".
 */
export function bellLabel(unread: number): string {
  if (unread === 0) return 'התראות'
  if (unread === 1) return 'התראות, הודעה אחת שלא נקראה'
  return `התראות, ${unread} הודעות שלא נקראו`
}

/** 99+ rather than a three-digit number that breaks the badge's circle. */
export function badgeText(unread: number): string {
  if (unread <= 0) return ''
  return unread > 99 ? '99+' : String(unread)
}
