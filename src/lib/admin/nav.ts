import type { UserRole } from '@/types/database'
import { isAdminRole, isStaffRole } from './roles'

// Admin sections keyed by base href. `staffAllowed` marks the sections a
// content_uploader (staff who is not an admin) may reach. Everything else is
// admin-only. content_uploader manages product content, so only /admin/products
// is open to them.
export const ADMIN_SECTIONS = [
  { href: '/admin/dashboard', staffAllowed: false },
  { href: '/admin/products', staffAllowed: true },
  { href: '/admin/categories', staffAllowed: false },
  { href: '/admin/suppliers', staffAllowed: false },
  { href: '/admin/orders', staffAllowed: false },
  { href: '/admin/coupons', staffAllowed: false },
  { href: '/admin/users', staffAllowed: false },
  { href: '/admin/audit-log', staffAllowed: false },
] as const

// Whether a role may access an admin section identified by an href (exact or a
// sub-path such as /admin/products/new).
export function canAccessAdminSection(role: UserRole, href: string): boolean {
  if (isAdminRole(role)) return true
  if (!isStaffRole(role)) return false
  const section = ADMIN_SECTIONS.find((s) => href === s.href || href.startsWith(`${s.href}/`))
  return section?.staffAllowed ?? false
}

// Base hrefs a role should see in the sidebar.
export function visibleAdminHrefs(role: UserRole): string[] {
  return ADMIN_SECTIONS.filter((s) => canAccessAdminSection(role, s.href)).map((s) => s.href)
}

// Landing path for /admin, based on the sections the role can reach.
export function adminLandingPath(role: UserRole): string {
  return isAdminRole(role) ? '/admin/dashboard' : '/admin/products'
}
