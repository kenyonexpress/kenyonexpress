import { isStaffRole } from '@/lib/admin/roles'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SecurityClient from './SecurityClient'

export const metadata = { title: 'אבטחת החשבון' }

export default async function SecurityPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account/security')

  // A failed role read renders the page as a plain customer's -- the staff
  // flag only changes copy, and the rbac gates re-derive the truth anyway.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isStaff = !profileError && profile != null && isStaffRole(profile.role)

  return (
    <>
      <h1 className="account-title">אבטחת החשבון</h1>
      <SecurityClient isStaff={isStaff} />
    </>
  )
}
