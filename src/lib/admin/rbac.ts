import { adminAllowlistDecision, isAllowlistConfigured } from '@/lib/admin/ip-allowlist'
import { adminMfaGate } from '@/lib/admin/mfa-gate'
import { type AdminSection, canReadSection, canWriteSection } from '@/lib/admin/permissions'
import { type UserRole, isAdminRole, isPanelRole, isStaffRole } from '@/lib/admin/roles'
import { log } from '@/lib/observability/log'
import { edgeClientAddress } from '@/lib/rate-limit/edge-shield'
import { createClient } from '@/lib/supabase/server'
import { isTrustedDevice } from '@/server/auth/trusted-device'
import { headers } from 'next/headers'
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

// The admin tier passes no guard without an MFA-verified session (aal2);
// super_admin since 181, admin since STEP 19. Sits in every require* below
// rather than in getSessionWithRole, which callers use for non-redirect
// decisions. The /admin-mfa page lives OUTSIDE the (admin) layout, so
// redirecting there cannot re-enter this gate.
async function enforceAdminMfa(session: AdminSessionInfo): Promise<void> {
  if (!isAdminRole(session.role)) return
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  // supabase-js types the levels as open strings; anything that is not
  // literally aal2/aal1 collapses to null, which the gate fails closed.
  const level = (value: string | null | undefined) =>
    value === 'aal2' ? 'aal2' : value === 'aal1' ? 'aal1' : null
  const decision = adminMfaGate(session.role, level(data?.currentLevel), level(data?.nextLevel))
  // A device remembered at a previous verify (STEP 18, 30 days, bound to
  // this user id) stands in for the challenge. It never stands in for
  // enrolment: with no factor there was never a verify to remember.
  if (decision === 'challenge' && (await isTrustedDevice(session.userId))) return
  if (decision !== 'ok') {
    redirect(`/admin-mfa?mode=${decision}`)
  }
}

// The IP allowlist (STEP 19), server-side half. The proxy answers 403 on the
// same decision before the session is read; this repeats it behind the proxy
// so a panel role reached through any path the proxy matcher does not cover
// (or a future one) still meets the perimeter. Inert while the variable is
// unset, which is every environment today; `lib/admin/ip-allowlist.ts` owns
// the parsing and the fail-closed rules. Denied sessions land on the
// storefront, the same place the proxy sends a role with no panel access.
async function enforceAdminIpAllowlist(session: AdminSessionInfo): Promise<void> {
  const raw = process.env.ADMIN_IP_ALLOWLIST
  if (!isAllowlistConfigured(raw)) return
  let address: string | null = null
  try {
    address = edgeClientAddress(await headers())
  } catch {
    address = null
  }
  if (adminAllowlistDecision(address, raw) === 'deny') {
    log.warn('admin.ip_allowlist_denied', {
      userId: session.userId,
      role: session.role,
      ip: address ?? 'unknown',
      layer: 'guard',
    })
    redirect('/')
  }
}

// Both perimeters, in the order the request meets them: where it came from,
// then what it proved. Every require* below runs this and nothing else.
async function enforceAdminPerimeter(session: AdminSessionInfo): Promise<void> {
  await enforceAdminIpAllowlist(session)
  await enforceAdminMfa(session)
}

// Server-component guard: redirects if caller is not admin/super_admin.
export async function requireAdminSession(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isAdminRole(session.role)) {
    redirect('/login')
  }
  await enforceAdminPerimeter(session)
  return session
}

// Catalog-writer guard: admin, super_admin, or content_uploader.
// Deliberately excludes support (read-only role, never writes catalog).
export async function requireStaffSession(): Promise<AdminSessionInfo> {
  const session = await getSessionWithRole()
  if (!session || !isStaffRole(session.role)) {
    redirect('/login')
  }
  await enforceAdminPerimeter(session)
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
  await enforceAdminPerimeter(session)
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
  await enforceAdminPerimeter(session)
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
