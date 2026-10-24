import AllInAppToggle from '@/components/account/AllInAppToggle'
import EmailToggle from '@/components/account/EmailToggle'
import PushToggle from '@/components/account/PushToggle'
import { createClient } from '@/lib/supabase/server'
import {
  setCouponExpiryEmail,
  setMarketingEmail,
  setOrderUpdatesEmail,
  setWalletActivityEmail,
} from '@/server/actions/notification-consent'

export const metadata = { title: 'התראות' }

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch current preferences from notification_preferences table
  let allInApp = false
  let orderUpdatesEmail = true
  let couponExpiryEmail = true
  let walletActivityEmail = false
  let marketingEmail = false

  if (user) {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select(
        'all_in_app, order_updates_email, coupon_expiry_email, wallet_activity_email, marketing_email',
      )
      .eq('user_id', user.id)
      .maybeSingle()

    if (!error && data) {
      allInApp = data.all_in_app ?? false
      orderUpdatesEmail = data.order_updates_email ?? true
      couponExpiryEmail = data.coupon_expiry_email ?? true
      walletActivityEmail = data.wallet_activity_email ?? false
      marketingEmail = data.marketing_email ?? false
    }
  }

  return (
    <>
      <h1 className="account-title">התראות</h1>
      <p className="account-subtitle">בחרו איך לקבל עדכונים מאיתנו. אפשר לשנות בכל רגע.</p>

      <section className="account-card">
        <h2 className="text-lg font-semibold mb-4">התראות באפליקציה</h2>
        <AllInAppToggle initial={allInApp} />
        <PushToggle />
      </section>

      <section className="account-card mt-6">
        <h2 className="text-lg font-semibold mb-4">עדכונים באימייל</h2>
        <EmailToggle
          initial={orderUpdatesEmail}
          title="עדכוני הזמנות"
          description="קבלו עדכונים על מצב ההזמנה שלכם: אישור, שליחה והגעה."
          action={setOrderUpdatesEmail}
          ariaLabelId="order-updates-email-label"
        />
        <EmailToggle
          initial={couponExpiryEmail}
          title="תזכורות לפני שקופון פג"
          description="תזכורת באימייל כשקופון שלכם עומד לפוג בקרוב."
          action={setCouponExpiryEmail}
          ariaLabelId="coupon-expiry-email-label"
        />
        <EmailToggle
          initial={walletActivityEmail}
          title="פעילות בארנק"
          description="עדכונים על שינויים ביתרה ובמבצעים בארנק הדיגיטלי שלכם."
          action={setWalletActivityEmail}
          ariaLabelId="wallet-activity-email-label"
        />
        <EmailToggle
          initial={marketingEmail}
          title="מבצעים ומוצרים חדשים"
          description="קבלו עדכונים על מבצעים מיוחדים, מוצרים חדשים והטבות בלעדיות."
          action={setMarketingEmail}
          ariaLabelId="marketing-email-label"
        />
      </section>
    </>
  )
}
