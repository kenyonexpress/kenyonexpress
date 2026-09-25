/**
 * "ספק מאומת", decided from facts the database already holds.
 *
 * There is no `verified` column and this module does not invent one: a flag an
 * operator can tick is a claim, and the badge is only worth showing when it
 * stands on something that happened. Two things count, and either suffices:
 *
 *   1. A human said yes. `supplier_applications.status = 'approved'` with
 *      `supplier_id` pointing at this row (the approve path in
 *      `actions/admin/supplier-applications.ts` writes both in one update).
 *      The table arrives with pending 204; until then the read reports
 *      "unknown" and this evidence is simply absent, never assumed.
 *   2. A customer redeemed. At least one `vouchers` row in status `redeemed`
 *      at this supplier: the business exists at the address, a shopper stood
 *      at its counter, and the code was honoured. Measured 2026-09-25: one of
 *      seven active suppliers.
 *
 * What does NOT count: `status = 'active'`, because 027 made it the column
 * DEFAULT and every seeded row carries it without anyone having looked; and
 * `business_id`, which no active supplier has on file (0 of 7) and which the
 * approve path copies from the application anyway, so evidence 1 covers it.
 *
 * An inactive or deleted supplier is never verified, whatever it once earned.
 */

export type VerificationBasis = 'approved_application' | 'redeemed_voucher'

export interface SupplierVerificationFacts {
  status: string | null | undefined
  deletedAt: string | null | undefined
  /** True when an approved application links to this supplier; null when the table is not there yet. */
  approvedApplication: boolean | null
  /** Vouchers redeemed at this supplier. */
  redeemedVouchers: number
}

export interface SupplierVerification {
  verified: boolean
  basis: VerificationBasis | null
}

export const NOT_VERIFIED: SupplierVerification = { verified: false, basis: null }

export function decideSupplierVerification(facts: SupplierVerificationFacts): SupplierVerification {
  if (facts.status !== 'active' || facts.deletedAt) return NOT_VERIFIED
  if (facts.approvedApplication === true) return { verified: true, basis: 'approved_application' }
  if (Number.isInteger(facts.redeemedVouchers) && facts.redeemedVouchers > 0) {
    return { verified: true, basis: 'redeemed_voucher' }
  }
  return NOT_VERIFIED
}
