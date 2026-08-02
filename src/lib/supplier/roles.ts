/**
 * Supplier member roles (ARCHITECTURE-SUPPLIER-PORTAL.md §1).
 * Higher rank includes every lower capability.
 */

export type SupplierMemberRole = 'scanner' | 'manager' | 'owner'

const ROLE_RANK: Record<SupplierMemberRole, number> = {
  scanner: 1,
  manager: 2,
  owner: 3,
}

export function normalizeMemberRole(raw: string | null | undefined): SupplierMemberRole {
  if (raw === 'owner' || raw === 'manager' || raw === 'scanner') return raw
  // Legacy / unknown rows: least privilege.
  return 'scanner'
}

export function hasMinRole(
  actual: string | null | undefined,
  minimum: SupplierMemberRole,
): boolean {
  const rank = ROLE_RANK[normalizeMemberRole(actual)]
  return rank >= ROLE_RANK[minimum]
}

export const ROLE_LABEL_HE: Record<SupplierMemberRole, string> = {
  scanner: 'סורק',
  manager: 'מנהל',
  owner: 'בעלים',
}
