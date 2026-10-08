import WishlistAlertPrefsCard from '@/components/account/WishlistAlertPrefs'
import CategoryMuteSwitches from '@/components/notifications/CategoryMuteSwitches'
import NotificationCenter from '@/components/notifications/NotificationCenter'
import PreferenceSwitches from '@/components/notifications/PreferenceSwitches'
import PushOptIn from '@/components/pwa/PushOptIn'
import { isCategory } from '@/lib/notifications/categories'
import { loadNotificationCenter } from '@/server/queries/notifications'

export const metadata = { title: 'התראות' }

/**
 * The notifications center (STEP 49), then the settings that were here before.
 *
 * THE LIST FIRST. Until now this page was settings only, and the rows a
 * customer had actually been told lived in a fifteen-row panel under the
 * bell. The center is the full list, shelved by `?category=`, with the
 * unread count per shelf, mark-all-read scoped to the tab, and a mute card
 * per shelf. The selected shelf comes from the URL so a tab survives a
 * reload and the bell can deep-link to it; an unknown value is "all", not
 * an error.
 *
 * The push card and the wishlist card stay client-probed, as before: whether
 * push is available is a property of THIS BROWSER (permission state, live
 * worker, existing subscription), which no server render can know, and the
 * wishlist card's probe is a server action. The per-kind switch matrix reads
 * the same preference rows the center loaded, handed down once.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category: raw } = await searchParams
  const category = raw && isCategory(raw) ? raw : null
  const center = await loadNotificationCenter(category)

  return (
    <>
      <h1 className="account-title">התראות</h1>
      <p className="account-subtitle">
        {center.unread > 0 ? `${center.unread} שלא נקראו` : 'הכל נקרא'} · עדכונים על הזמנות, מבצעים
        והחשבון, ישירות למסך
      </p>

      <NotificationCenter
        rows={center.rows}
        counts={center.counts}
        selected={category}
        muted={center.muted}
      />

      <section className="account-card" style={{ marginTop: 16 }}>
        <h2 className="account-card__title">אילו קטגוריות להציג בפעמון</h2>
        <CategoryMuteSwitches muted={center.muted} />
      </section>

      <div style={{ marginTop: 16 }}>
        <PushOptIn />
      </div>
      <section className="account-card" style={{ marginTop: 16 }}>
        <h2 className="account-card__title">אילו הודעות לקבל, ובאיזה ערוץ</h2>
        <PreferenceSwitches rows={center.preferences} />
      </section>
      <WishlistAlertPrefsCard />
    </>
  )
}
