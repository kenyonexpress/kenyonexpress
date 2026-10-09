import type { UserRole } from '@/types/database'

// 181 is applied in production (2026-09-08, read_only_enum_181a +
// admin_rbac_hardening_181b in schema_migrations) and database.ts carries
// 'read_only', so the AppRole alias completed its lifecycle contract and is
// gone; the admin layer works in the generated UserRole, re-exported here so
// role helpers and role type keep a single import point.
export type { UserRole } from '@/types/database'

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'לקוח',
  vendor: 'ספק',
  content_uploader: 'עורך תוכן',
  support: 'שירות לקוחות',
  read_only: 'צפייה בלבד',
  admin: 'מנהל',
  super_admin: 'מנהל על',
}

export const ROLE_ORDER: UserRole[] = [
  'customer',
  'vendor',
  'content_uploader',
  'support',
  'read_only',
  'admin',
  'super_admin',
]

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

// support sits OUTSIDE the has_role() hierarchy (V2 section 6.1): it gets
// operational read access, never catalog writes. read_only (181) shares the
// tier: it reads every section and writes nothing anywhere.
export function isSupportRole(role: UserRole | null | undefined): boolean {
  return role === 'support' || role === 'read_only' || isAdminRole(role)
}

// Staff = catalog writers. Existing write guards depend on this meaning,
// so support and read_only are deliberately NOT included here.
export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role === 'content_uploader' || isAdminRole(role)
}

// Panel entry: everyone with any admin-panel access, including support and
// read_only.
export function isPanelRole(role: UserRole | null | undefined): boolean {
  return isStaffRole(role) || isSupportRole(role)
}
