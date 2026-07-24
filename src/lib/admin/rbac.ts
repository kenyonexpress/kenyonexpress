import { type AdminSection, canReadSection, canWriteSection } from '@/lib/admin/permissions'
import { isAdminRole, isPanelRole, isStaffRole } from '@/lib/admin/roles'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'
import { redirect } from 'next/navigation'

export { ROLE_LABELS, ROLE_ORDER, isAdminRole, isPanelRole, isStaffRole } from '@/lib/admin/roles'

export type AdminSessionInfo = { userId: string; role: UserRole }

export async function getSessionWithRole(): Promise<AdminSessionInfo | null> {
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
export async function requireAdminSession(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isAdminRole(session.role)) {
    redirect('/login')
  }
  return session
}

// Catalog-writer guard: admin, super_admin, or content_uploader.
// Deliberately excludes support (read-only role, never writes catalog).
export async function requireStaffSession(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isStaffRole(session.role)) {
    redirect('/login')
  }
  return session
}

// Guard for admin-only pages inside the staff-accessible admin panel. Non-staff
// go to /login; staff who are not admins (content_uploader) are sent to the one
// section they can use instead of being bounced out of the panel entirely.
export async function requireAdminPage(): Promise<{ userId: string; role: UserRole }> {
  const session = await getSessionWithRole()
  if (!session || !isStaffRole(session.role)) {
    redirect('/login')
  }
  if (!isAdminRole(session.role)) {
    redirect('/admin/products')
  }
  return session
}

// Panel-entry guard for the (admin) layout: any role with panel access,
// including support. Pages still gate per-section via requireSection.
export async function requirePanelSession(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isPanelRole(session.role)) {
    redirect('/login')
  }
  return session
}

// Per-page gate (guard layer 3 of 4): panel entry passed, now enforce the
// section matrix. Redirects into the panel root rather than /login so a
// support user deep-linking to /admin/payments lands somewhere useful.
export async function requireSection(
  section: AdminSection,
  access: 'read' | 'write' = 'read',
): Promise<AdminSessionInfo> {
  const session = await requirePanelSession()
  const allowed =
    access === 'write'
      ? canWriteSection(session.role, section)
      : canReadSection(session.role, section)
  if (!allowed) {
    redirect('/admin')
  }
  return session
}
