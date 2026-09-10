import WishlistAlertPrefsCard from '@/components/account/WishlistAlertPrefs'
import PushOptIn from '@/components/pwa/PushOptIn'

export const metadata = { title: 'התראות' }

/**
 * Static shell on purpose, unlike security/page.tsx: whether push is
 * available is a property of THIS BROWSER (permission state, live worker,
 * existing subscription), which no server render can know. The client
 * component probes it; the "not available yet" answer for an unapplied
 * migration 179 arrives through the save action's error path instead.
 * The wishlist mail card keeps the same shape for the same reason: its
 * probe is a server action, so this page never reads per-user data itself.
 */
export default function NotificationsPage() {
  return (
    <>
      <h1 className="account-title">התראות</h1>
      <p className="account-subtitle">עדכונים על הזמנות, קופונים וקאשבק, ישירות למסך</p>
      <PushOptIn />
      <WishlistAlertPrefsCard />
    </>
  )
}
