import { isAdminRole, isStaffRole } from '@/lib/admin/roles'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'
import { redirect } from 'next/navigation'

export { ROLE_LABELS, ROLE_ORDER, isAdminRole, isStaffRole } from '@/lib/admin/roles'

export async function getSessionWithRole(): Promise<{
  userId: string
  role: UserRole
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  return { userId: user.id, role: profile.role }
}

// Server-component guard: redirects if caller is not admin/super_admin.
export async function requireAdminSession(): Promise<{ userId: string; role: UserRole }> {
  const session = await getSessionWithRole()
  if (!session || !isAdminRole(session.role)) {
    redirect('/login')
  }
  return session
}

// Admin panel guard: admin, super_admin, or content_uploader.
export async function requireStaffSession(): Promise<{ userId: string; role: UserRole }> {
  const session = await getSessionWithRole()
  if (!session || !isStaffRole(session.role)) {
    redirect('/login')
  }
  return session
}
