import { type AppRole, isAdminRole } from '@/lib/admin/roles'

// Pure RBAC decisions for the admin panel. No IO here: everything is
// unit-testable. Matrix source: ARCHITECTURE-ADMIN.md section 3.2, which is
// the live subset of ARCHITECTURE-ADMIN-OPS-V2 section 6.2.
//
// Role tiers inside the panel:
//   admin / super_admin : full access
//   content_uploader    : catalog only (products, categories, coupons, approvals)
//   support             : operational reads (orders, users, affiliates), no money
//   read_only           : observer tier (181): reads every section, writes nothing

export type AdminSection =
  | 'dashboard'
  | 'catalog'
  | 'orders'
  | 'users'
  | 'payments'
  | 'affiliates'
  | 'analytics'
  | 'audit-log'
  | 'suppliers'
  | 'discounts'
  | 'content'

export type SectionAccess = 'none' | 'read' | 'write'

const CONTENT_UPLOADER_ACCESS: Record<AdminSection, SectionAccess> = {
  dashboard: 'none',
  catalog: 'write',
  orders: 'none',
  users: 'none',
  payments: 'none',
  affiliates: 'none',
  analytics: 'none',
  'audit-log': 'none',
  suppliers: 'none',
  // A campaign spends the platform's commission. That is money, and money is
  // not part of the catalog role, however much a discount code looks like content.
  discounts: 'none',
  // The site's own pages say how refunds, cancellation and validity work, and
  // under Israeli consumer law a factual claim on a marketing page binds the
  // business. `content_uploader` loads catalogue copy; it does not get to
  // rewrite what the business promises. The name of the role is the trap here:
  // "content" in `content_uploader` means product content.
  content: 'none',
}

const SUPPORT_ACCESS: Record<AdminSection, SectionAccess> = {
  dashboard: 'read',
  catalog: 'none',
  orders: 'read',
  users: 'read',
  payments: 'none',
  affiliates: 'read',
  analytics: 'none',
  'audit-log': 'none',
  suppliers: 'read',
  // Support answers "why did my code not work", so it must see the campaign.
  // It may not create or edit one: that is spending.
  discounts: 'read',
  // Support quotes these pages back to customers, so reading them is part of
  // answering. Editing them is not.
  content: 'read',
}

export function sectionAccess(
  role: AppRole | null | undefined,
  section: AdminSection,
): SectionAccess {
  if (isAdminRole(role)) return 'write'
  if (role === 'content_uploader') return CONTENT_UPLOADER_ACCESS[section]
  if (role === 'support') return SUPPORT_ACCESS[section]
  // The observer tier: every section readable, none writable. A matrix of
  // constant 'read' would only invite drift when sections are added.
  if (role === 'read_only') return 'read'
  return 'none'
}

export function canReadSection(role: AppRole | null | undefined, section: AdminSection): boolean {
  return sectionAccess(role, section) !== 'none'
}

export function canWriteSection(role: AppRole | null | undefined, section: AdminSection): boolean {
  return sectionAccess(role, section) === 'write'
}

// Money numbers (revenue, payments amounts) are admin-tier only; support and
// read_only see the dashboard without them (V2 rule 2.2.1).
export function canSeeMoney(role: AppRole | null | undefined): boolean {
  return isAdminRole(role)
}

// Which roles may this caller assign to other users?
// super_admin: everything. admin: up to content_uploader/support/read_only,
// never admin+ (enforced again inside the server action and by the DB trigger
// hardened in 181).
export function assignableRoles(callerRole: AppRole | null | undefined): AppRole[] {
  if (callerRole === 'super_admin') {
    return [
      'customer',
      'vendor',
      'content_uploader',
      'support',
      'read_only',
      'admin',
      'super_admin',
    ]
  }
  if (callerRole === 'admin') {
    return ['customer', 'vendor', 'content_uploader', 'support', 'read_only']
  }
  return []
}

export function canAssignRole(
  callerRole: AppRole | null | undefined,
  targetRole: AppRole,
): boolean {
  return assignableRoles(callerRole).includes(targetRole)
}
