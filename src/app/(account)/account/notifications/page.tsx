import AllInAppToggle from '@/components/account/AllInAppToggle'
import BrowserPushToggle from '@/components/account/BrowserPushToggle'
import { ALL_IN_APP_CONSENT_KEY } from '@/lib/consent-keys'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'התראות' }

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let granted = false
  if (user) {
    // The latest consent row is the current answer (migration 280).
    const { data, error } = await supabase
      .from('user_consents' as never)
      .select('granted, created_at')
      .eq('user_id', user.id)
      .eq('consent_key', ALL_IN_APP_CONSENT_KEY)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!error && data) granted = (data as { granted: boolean }).granted === true
  }

  return (
    <>
      <h1 className="account-title">התראות</h1>
      <p className="account-subtitle">בחרו איך לקבל עדכונים מאיתנו. אפשר לשנות בכל רגע.</p>
      <section className="account-card">
        <AllInAppToggle initial={granted} />
        <BrowserPushToggle />
      </section>
    </>
  )
}
