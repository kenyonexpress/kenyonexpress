import { isAdminRole } from '@/lib/admin/roles'
import type { UserRole } from '@/types/database'

// Pure RBAC decisions for the admin panel. No IO here: everything is
// unit-testable. Matrix source: ARCHITECTURE-ADMIN.md section 3.2, which is
// the live subset of ARCHITECTURE-ADMIN-OPS-V2 section 6.2.
//
// Role tiers inside the panel:
//   admin / super_admin : full access
//   content_uploader    : catalog only (products, categories, coupons, approvals)
//   support             : operational reads (orders, users, affiliates), no money

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
}

export function sectionAccess(
  role: UserRole | null | undefined,
  section: AdminSection,
): SectionAccess {
  if (isAdminRole(role)) return 'write'
  if (role === 'content_uploader') return CONTENT_UPLOADER_ACCESS[section]
  if (role === 'support') return SUPPORT_ACCESS[section]
  return 'none'
}

export function canReadSection(role: UserRole | null | undefined, section: AdminSection): boolean {
  return sectionAccess(role, section) !== 'none'
}

export function canWriteSection(role: UserRole | null | undefined, section: AdminSection): boolean {
  return sectionAccess(role, section) === 'write'
}

// Money numbers (revenue, payments amounts) are admin-tier only; support sees
// the dashboard without them (V2 rule 2.2.1).
export function canSeeMoney(role: UserRole | null | undefined): boolean {
  return isAdminRole(role)
}

// Which roles may this caller assign to other users?
// super_admin: everything. admin: up to content_uploader/support, never
// admin+ (enforced again inside the server action and by DB trigger 035).
export function assignableRoles(callerRole: UserRole | null | undefined): UserRole[] {
  if (callerRole === 'super_admin') {
    return ['customer', 'vendor', 'content_uploader', 'support', 'admin', 'super_admin']
  }
  if (callerRole === 'admin') {
    return ['customer', 'vendor', 'content_uploader', 'support']
  }
  return []
}

export function canAssignRole(
  callerRole: UserRole | null | undefined,
  targetRole: UserRole,
): boolean {
  return assignableRoles(callerRole).includes(targetRole)
}
