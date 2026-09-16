import ChangePasswordForm from '@/components/account/ChangePasswordForm'
import PasskeyManager from '@/components/account/PasskeyManager'
import ReplayOptInToggle from '@/components/account/ReplayOptInToggle'
import { isStaffRole } from '@/lib/admin/roles'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { listPasskeys } from '@/server/actions/passkeys'
import SecurityClient from './SecurityClient'

export const metadata = { title: 'אבטחה וכניסה' }

/**
 * Whether the signed-in customer is staff, off `profiles.role` under RLS.
 * Only the copy on the TOTP card changes with it: staff are told the panel
 * will demand the code from now on (lib/auth/mfa.ts), shoppers are not.
 */
async function currentUserIsStaff(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  // Only a sentence of copy hangs off this, so a failed read is logged and
  // the page renders the shopper wording rather than refusing to load.
  if (error) log.warn('account.security_role_read_failed', { reason: error.message })
  return isStaffRole(data?.role)
}

export default async function SecurityPage() {
  // The same action the client refreshes with, called in-process here for the
  // first paint. `available: false` means migration 178 has not been applied;
  // the page still renders, with an empty list the manager can explain.
  const [result, isStaff] = await Promise.all([listPasskeys(), currentUserIsStaff()])
  const initial = 'available' in result && result.available ? result.passkeys : []
  const available = 'available' in result && result.available

  return (
    <>
      <h1 className="account-title">אבטחה וכניסה</h1>
      <p className="account-subtitle">ניהול הדרכים להתחבר לחשבון שלך</p>

      <section className="account-card">
        <h2 className="account-card__title">שינוי סיסמה</h2>
        <ChangePasswordForm />
      </section>

      {available ? (
        <PasskeyManager initial={initial} />
      ) : (
        <section className="account-card">
          <h2 className="account-card__title">מפתחות כניסה (Passkeys)</h2>
          <p className="account-row__meta">
            כניסה עם טביעת אצבע או Face ID עדיין לא זמינה בחשבון הזה. בינתיים אפשר להתחבר עם סיסמה,
            עם קישור לאימייל או עם קוד ב-SMS.
          </p>
        </section>
      )}

      {/*
        TOTP enrolment against Supabase's native MFA. The component existed
        with no page rendering it, so a staff account had no way to enrol and
        the aal2 gate in lib/auth/mfa.ts guarded nobody.
      */}
      <SecurityClient isStaff={isStaff} />

      <ReplayOptInToggle />
    </>
  )
}
