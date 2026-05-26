import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'
import { redirect } from 'next/navigation'

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'לקוח',
  vendor: 'ספק',
  content_uploader: 'מעלה תוכן',
  admin: 'מנהל',
  super_admin: 'מנהל על',
}

export const ROLE_ORDER: UserRole[] = [
  'customer',
  'vendor',
  'content_uploader',
  'admin',
  'super_admin',
]

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

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
    redirect('/')
  }
  return session
}
