import type { UserRole } from '@/types/database'

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'לקוח',
  vendor: 'ספק',
  content_uploader: 'עורך תוכן',
  support: 'שירות לקוחות',
  admin: 'מנהל',
  super_admin: 'מנהל על',
}

export const ROLE_ORDER: UserRole[] = [
  'customer',
  'vendor',
  'content_uploader',
  'support',
  'admin',
  'super_admin',
]

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

// support sits OUTSIDE the has_role() hierarchy (V2 section 6.1): it gets
// operational read access, never catalog writes.
export function isSupportRole(role: UserRole | null | undefined): boolean {
  return role === 'support' || isAdminRole(role)
}

// Staff = catalog writers. Existing write guards depend on this meaning,
// so support is deliberately NOT included here.
export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role === 'content_uploader' || isAdminRole(role)
}

// Panel entry: everyone with any admin-panel access, including support.
export function isPanelRole(role: UserRole | null | undefined): boolean {
  return isStaffRole(role) || role === 'support'
}
