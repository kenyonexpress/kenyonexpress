import type { UserRole } from '@/types/database'

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

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role === 'content_uploader' || isAdminRole(role)
}
