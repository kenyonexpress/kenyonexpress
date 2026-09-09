import PreferenceSwitches from '@/components/notifications/PreferenceSwitches'
import PushOptIn from '@/components/pwa/PushOptIn'
import { markNotificationRead } from '@/server/actions/notifications'
import { loadNotifications, loadPreferences } from '@/server/queries/notifications'
import Link from 'next/link'

export const metadata = { title: 'התראות' }

/**
 * The notification centre: what you have been told, and what you want to be
 * told next time.
 *
 * NOT STATIC ANY MORE, and the old header explained why it was. It said the
 * page was "a static shell on purpose, unlike security/page.tsx: whether push
 * is available is a property of THIS BROWSER" -- which is still true of the
 * push opt-in and is why `PushOptIn` is still a client component. What has
 * changed is that there is now server state on this page: the customer's own
 * notifications and their own preferences, both read under RLS.
 *
 * Both reads return empty while `migrations/pending/198` is unapplied, so the
 * page renders as "no notifications yet" rather than failing. That is what a
 * customer with no notifications should see, which makes it the right empty
 * state rather than a disguised error.
 */
export default async function NotificationsPage() {
  const [items, preferences] = await Promise.all([loadNotifications(), loadPreferences()])
  const unread = items.filter((item) => item.readAt === null)

  return (
    <>
      <h1 className="account-title">התראות</h1>
      <p className="account-subtitle">עדכונים על הזמנות, קופונים וקאשבק, ישירות למסך</p>

      <section className="account-card">
        <h2 className="account-card__title">מה קרה</h2>

        {items.length === 0 ? (
          <p className="text-sm text-muted">אין עדיין התראות.</p>
        ) : (
          <>
            {unread.length > 0 && (
              <form
                action={async () => {
                  'use server'
                  await markNotificationRead(null)
                }}
              >
                <button type="submit" className="account-btn">
                  סימון הכול כנקרא ({unread.length})
                </button>
              </form>
            )}

            <ul className="mt-3">
              {items.map((item) => (
                <li className="account-row" key={item.id}>
                  <div className="account-row__main">
                    <p className="account-row__title">
                      {/* The unread marker is a word, not only a colour. A dot
                          alone is invisible to a screen reader and to anyone
                          who cannot distinguish it from the read state. */}
                      {item.readAt === null && (
                        <span className="me-2 text-xs font-bold text-price">חדש</span>
                      )}
                      {item.href ? <Link href={item.href}>{item.titleHe}</Link> : item.titleHe}
                    </p>
                    {item.bodyHe && <p className="account-row__meta">{item.bodyHe}</p>}
                    <p className="account-row__meta">
                      {new Date(item.createdAt).toLocaleString('he-IL', {
                        timeZone: 'Asia/Jerusalem',
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="account-card">
        <h2 className="account-card__title">מה לשלוח לי</h2>
        <PreferenceSwitches rows={preferences} />
      </section>

      <section className="account-card">
        <h2 className="account-card__title">התראות דחיפה</h2>
        <PushOptIn />
      </section>
    </>
  )
}
