import type { UserRole } from '@/types/database'

/**
 * The uploader money boundary, as one pure decision.
 *
 * ARCHITECTURE-SUPPLIER-PORTAL.md marks platform_percent "admin-only write;
 * no default"; supplier_split_percent is its pair (they must sum to 100).
 * content_uploader writes CONTENT -- the split is the platform's business
 * terms. Strip rather than refuse: the product form always posts every
 * field, so refusing would brick the uploader's editor; stripping leaves a
 * create with a NULL split (the cart marks that line unavailable, C1) and an
 * edit with the stored value untouched.
 *
 * The same role's writes land approval_status='pending': the DB default is
 * 'approved', so without this an uploader's product skips the approvals
 * queue entirely.
 */

export const UPLOADER_STRIPPED_FIELDS = ['platform_percent', 'supplier_split_percent'] as const

export function applyUploaderPolicy<T extends Record<string, unknown>>(
  role: UserRole,
  moneyFields: T,
): { fields: T; forcePendingApproval: boolean } {
  if (role !== 'content_uploader') return { fields: moneyFields, forcePendingApproval: false }
  const fields = { ...moneyFields }
  for (const key of UPLOADER_STRIPPED_FIELDS) {
    delete (fields as Record<string, unknown>)[key]
  }
  return { fields, forcePendingApproval: true }
}
