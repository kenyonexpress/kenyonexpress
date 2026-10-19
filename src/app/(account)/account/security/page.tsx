import PasskeyManager from '@/components/auth/PasskeyManager'
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
      <h1 className="account-title">אבטחת החשבון</h1>
      <PasskeyManager />
      <SecurityClient isStaff={isStaff} />

      <ReplayOptInToggle />
    </>
  )
}
