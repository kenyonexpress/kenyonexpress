import WishlistAlertPrefsCard from '@/components/account/WishlistAlertPrefs'
import PreferenceSwitches from '@/components/notifications/PreferenceSwitches'
import PushOptIn from '@/components/pwa/PushOptIn'
import { loadPreferences } from '@/server/queries/notifications'

export const metadata = { title: 'התראות' }

/**
 * Three cards. The push card and the wishlist card stay client-probed, as
 * before: whether push is available is a property of THIS BROWSER (permission
 * state, live worker, existing subscription), which no server render can
 * know, and the wishlist card's probe is a server action.
 *
 * The switch matrix is the one that was missing. `PreferenceSwitches` was
 * written with the bell (the kinds, the channels, the per-switch save) and
 * rendered by nothing: the table it writes exists in production with its own
 * RLS, the senders consult it, and no page offered the switches. The rows are
 * read here, through RLS on the session, and handed to the matrix once.
 */
export default async function NotificationsPage() {
  const rows = await loadPreferences()

  return (
    <>
      <h1 className="account-title">התראות</h1>
      <p className="account-subtitle">עדכונים על הזמנות, קופונים וקאשבק, ישירות למסך</p>
      <PushOptIn />
      <section className="account-card" style={{ marginTop: 16 }}>
        <h2 className="account-card__title">אילו הודעות לקבל, ובאיזה ערוץ</h2>
        <PreferenceSwitches rows={rows} />
      </section>
      <WishlistAlertPrefsCard />
    </>
  )
}
