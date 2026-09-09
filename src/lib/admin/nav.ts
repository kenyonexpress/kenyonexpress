import { type AppRole, isAdminRole, isStaffRole } from './roles'

// Admin sections keyed by base href. `staffAllowed` marks the sections a
// content_uploader (staff who is not an admin) may reach. Everything else is
// admin-only. content_uploader manages catalogue copy: products, categories,
// and coupon deals. Money, suppliers, orders and users stay admin-only.
export const ADMIN_SECTIONS = [
  { href: '/admin/dashboard', staffAllowed: false },
  { href: '/admin/analytics', staffAllowed: false },
  { href: '/admin/products', staffAllowed: true },
  { href: '/admin/categories', staffAllowed: true },
  { href: '/admin/coupons', staffAllowed: true },
  { href: '/admin/suppliers', staffAllowed: false },
  { href: '/admin/vendors', staffAllowed: false },
  { href: '/admin/orders', staffAllowed: false },
  { href: '/admin/cashback', staffAllowed: false },
  { href: '/admin/users', staffAllowed: false },
  { href: '/admin/pages', staffAllowed: false },
  { href: '/admin/homepage', staffAllowed: false },
  { href: '/admin/audit-log', staffAllowed: false },
] as const

// Whether a role may access an admin section identified by an href (exact or a
// sub-path such as /admin/products/new).
export function canAccessAdminSection(role: AppRole, href: string): boolean {
  if (isAdminRole(role)) return true
  // read_only (181) navigates everywhere admins do; every page renders its
  // read view and canWriteSection keeps the mutations away.
  if (role === 'read_only') return true
  if (!isStaffRole(role)) return false
  const section = ADMIN_SECTIONS.find((s) => href === s.href || href.startsWith(`${s.href}/`))
  return section?.staffAllowed ?? false
}

// Base hrefs a role should see in the sidebar.
export function visibleAdminHrefs(role: AppRole): string[] {
  return ADMIN_SECTIONS.filter((s) => canAccessAdminSection(role, s.href)).map((s) => s.href)
}

// Landing path for /admin, based on the sections the role can reach.
export function adminLandingPath(role: AppRole): string {
  return isAdminRole(role) || role === 'read_only' ? '/admin/dashboard' : '/admin/products'
}
