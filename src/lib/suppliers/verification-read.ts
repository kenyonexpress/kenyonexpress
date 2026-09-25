import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingRelation } from '@/lib/supabase/pending-schema'
import {
  NOT_VERIFIED,
  type SupplierVerification,
  decideSupplierVerification,
} from '@/lib/suppliers/verification'

/**
 * The two facts `decideSupplierVerification` weighs, read with the service
 * client: `vouchers` has no public policy (a shopper must not enumerate who
 * redeemed what), and `supplier_applications` is admin-only by design.
 *
 * Both reads are head counts, so nothing about the vouchers or the applicant
 * leaves the database. Callers sit inside `'use cache'` loaders, so the cost is
 * two indexed counts an hour per supplier, not per view.
 *
 * NEVER THROWS. A product page must not 500 because a badge could not be
 * decided; an unreadable fact is "no evidence", and the badge stays off.
 */
export async function readSupplierVerification(row: {
  id: string
  status: string | null | undefined
  deleted_at: string | null | undefined
}): Promise<SupplierVerification> {
  // Cheap exit before any query: whatever an inactive supplier once earned,
  // the decision is fixed, and the reads would only be spent to confirm it.
  if (row.status !== 'active' || row.deleted_at) return NOT_VERIFIED

  try {
    const admin = createAdminClient()
    const [redeemed, approved] = await Promise.all([
      admin
        .from('vouchers')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', row.id)
        .eq('status', 'redeemed'),
      admin
        .from('supplier_applications')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', row.id)
        .eq('status', 'approved'),
    ])

    if (redeemed.error) {
      log.warn('supplier.verification_vouchers_read_failed', {
        supplierId: row.id,
        reason: redeemed.error.message,
      })
    }

    let approvedApplication: boolean | null = null
    if (approved.error) {
      // Pending 204: the table is not there yet. Not an error worth a log line
      // on every product page; the evidence is simply absent until it lands.
      if (!isMissingRelation(approved.error)) {
        log.warn('supplier.verification_applications_read_failed', {
          supplierId: row.id,
          reason: approved.error.message,
        })
      }
    } else {
      approvedApplication = (approved.count ?? 0) > 0
    }

    return decideSupplierVerification({
      status: row.status,
      deletedAt: row.deleted_at,
      approvedApplication,
      redeemedVouchers: redeemed.error ? 0 : (redeemed.count ?? 0),
    })
  } catch (error) {
    log.warn('supplier.verification_read_threw', {
      supplierId: row.id,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return NOT_VERIFIED
  }
}
