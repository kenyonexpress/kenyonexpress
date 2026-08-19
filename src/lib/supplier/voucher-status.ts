/**
 * How a voucher's status is shown to the business that will scan it.
 *
 * WHY THIS IS NOT JUST A LOOKUP TABLE. `vouchers.status` stays `issued` after
 * the voucher expires; nothing sweeps the table on the hour. `redeem_voucher`
 * knows this and refuses on `expires_at <= now()` regardless of the stored
 * status. If the portal printed the raw column, a supplier would see "פעיל"
 * next to a code the scanner is about to reject, and would argue with a
 * customer holding it. So expiry is derived here the same way the RPC derives
 * it, and the two agree by construction.
 *
 * Only `issued` is reinterpreted. A redeemed, cancelled or refunded voucher
 * keeps its own status forever; those are terminal and expiry cannot overtake
 * them.
 */

export type VoucherDisplayStatus = 'active' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'

export const VOUCHER_STATUS_LABEL: Record<VoucherDisplayStatus, string> = {
  active: 'פעיל',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'זוכה',
}

export function voucherDisplayStatus(
  voucher: { status: string; expiresAt: string | null },
  now: Date = new Date(),
): VoucherDisplayStatus {
  switch (voucher.status) {
    case 'redeemed':
      return 'redeemed'
    case 'cancelled':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    case 'expired':
      return 'expired'
    case 'issued': {
      if (!voucher.expiresAt) return 'active'
      const expires = new Date(voucher.expiresAt)
      if (Number.isNaN(expires.getTime())) return 'active'
      return expires.getTime() <= now.getTime() ? 'expired' : 'active'
    }
    default:
      // An unknown status is never shown as usable. A code the portal cannot
      // classify is one the till should not promise anything about.
      return 'expired'
  }
}

/** Whether a scan of this voucher would be accepted right now. */
export function isScannable(status: VoucherDisplayStatus): boolean {
  return status === 'active'
}
