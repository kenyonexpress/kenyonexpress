import { superAdminMfaGate } from '@/lib/admin/mfa-gate'
import { type AdminSection, canReadSection, canWriteSection } from '@/lib/admin/permissions'
import { type AppRole, isAdminRole, isPanelRole, isStaffRole } from '@/lib/admin/roles'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export { ROLE_LABELS, ROLE_ORDER, isAdminRole, isPanelRole, isStaffRole } from '@/lib/admin/roles'

export type AdminSessionInfo = { userId: string; role: AppRole }

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

// super_admin passes no guard without an MFA-verified session (aal2). Sits in
// every require* below rather than in getSessionWithRole, which callers use
// for non-redirect decisions. The /admin-mfa page lives OUTSIDE the (admin)
// layout, so redirecting there cannot re-enter this gate.
async function enforceSuperAdminMfa(session: AdminSessionInfo): Promise<void> {
  if (session.role !== 'super_admin') return
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  // supabase-js types the levels as open strings; anything that is not
  // literally aal2/aal1 collapses to null, which the gate fails closed.
  const level = (value: string | null | undefined) =>
    value === 'aal2' ? 'aal2' : value === 'aal1' ? 'aal1' : null
  const decision = superAdminMfaGate(
    session.role,
    level(data?.currentLevel),
    level(data?.nextLevel),
  )
  if (decision !== 'ok') {
    redirect(`/admin-mfa?mode=${decision}`)
  }
}

// Server-component guard: redirects if caller is not admin/super_admin.
export async function requireAdminSession(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isAdminRole(session.role)) {
    redirect('/login')
  }
  await enforceSuperAdminMfa(session)
  return session
}

// Catalog-writer guard: admin, super_admin, or content_uploader.
// Deliberately excludes support (read-only role, never writes catalog).
export async function requireStaffSession(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isStaffRole(session.role)) {
    redirect('/login')
  }
  await enforceSuperAdminMfa(session)
  return session
}

// Guard for admin-only pages inside the staff-accessible admin panel. Non-staff
// go to /login; staff who are not admins (content_uploader) are sent to the one
// section they can use instead of being bounced out of the panel entirely.
export async function requireAdminPage(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isStaffRole(session.role)) {
    redirect('/login')
  }
  if (!isAdminRole(session.role)) {
    redirect('/admin/products')
  }
  await enforceSuperAdminMfa(session)
  return session
}

// Panel-entry guard for the (admin) layout: any role with panel access,
// including support and read_only. Pages still gate per-section via
// requireSection.
export async function requirePanelSession(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isPanelRole(session.role)) {
    redirect('/login')
  }
  await enforceSuperAdminMfa(session)
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
