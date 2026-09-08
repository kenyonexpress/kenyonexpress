import type { UserRole } from '@/types/database'

// Migration 181a APPLIED 2026-09-09 (`read_only_enum_181a`): production's
// user_role now reads {customer,content_uploader,vendor,admin,super_admin,
// support,read_only}. `src/types/database.ts` has NOT been regenerated yet, so
// the generated UserRole still cannot name it and the union below is still
// load-bearing. It is also self-healing: regenerate database.ts and
// `UserRole | 'read_only'` collapses to UserRole with no type error, at which
// point this alias can go (same lifecycle contract as
// lib/auth/passkeys/store.ts for 178).
export type AppRole = UserRole | 'read_only'

export const ROLE_LABELS: Record<AppRole, string> = {
  customer: 'לקוח',
  vendor: 'ספק',
  content_uploader: 'עורך תוכן',
  support: 'שירות לקוחות',
  read_only: 'צפייה בלבד',
  admin: 'מנהל',
  super_admin: 'מנהל על',
}

export const ROLE_ORDER: AppRole[] = [
  'customer',
  'vendor',
  'content_uploader',
  'support',
  'read_only',
  'admin',
  'super_admin',
]

export function isAdminRole(role: AppRole | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

// support sits OUTSIDE the has_role() hierarchy (V2 section 6.1): it gets
// operational read access, never catalog writes. read_only (181) shares the
// tier: it reads every section and writes nothing anywhere.
export function isSupportRole(role: AppRole | null | undefined): boolean {
  return role === 'support' || role === 'read_only' || isAdminRole(role)
}

// Staff = catalog writers. Existing write guards depend on this meaning,
// so support and read_only are deliberately NOT included here.
export function isStaffRole(role: AppRole | null | undefined): boolean {
  return role === 'content_uploader' || isAdminRole(role)
}

// Panel entry: everyone with any admin-panel access, including support and
// read_only.
export function isPanelRole(role: AppRole | null | undefined): boolean {
  return isStaffRole(role) || isSupportRole(role)
}
