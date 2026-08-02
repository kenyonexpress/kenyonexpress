/**
 * Presentation rules for the admin voucher screens.
 *
 * Pure, so the list, the detail page and the tests agree on what a voucher's
 * state actually is. In particular "issued" in the column is not the same as
 * "usable at a counter": the expiry sweep is a cron, so a voucher can sit at
 * `issued` for hours after its deadline. The admin needs the real answer, not
 * the stored one.
 */

export type VoucherStatus = 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  issued: 'הונפק',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'הוחזר',
}

export type BadgeVariant = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

export const VOUCHER_STATUS_VARIANTS: Record<VoucherStatus, BadgeVariant> = {
  issued: 'blue',
  redeemed: 'green',
  expired: 'red',
  cancelled: 'gray',
  refunded: 'gray',
}

/**
 * Whether the QR is worth rendering and presenting.
 *
 * Only an `issued` voucher that has not passed its deadline can be scanned. A
 * QR next to a redeemed or lapsed voucher invites a supplier to try, and the
 * scan then fails at the counter in front of a customer.
 */
export function isScannable(
  voucher: { status: string; expires_at: string },
  now: Date = new Date(),
): boolean {
  if (voucher.status !== 'issued') return false
  const expiry = new Date(voucher.expires_at)
  if (Number.isNaN(expiry.getTime())) return false
  return expiry.getTime() > now.getTime()
}

/**
 * True when the stored status has not caught up with the clock.
 *
 * The sweep (migration 068) moves these to `expired` on a schedule. Between the
 * deadline and the next run the row still reads `issued`, and an admin looking
 * at a scan report would otherwise count it as live.
 */
export function isLapsedButUnswept(
  voucher: { status: string; expires_at: string },
  now: Date = new Date(),
): boolean {
  if (voucher.status !== 'issued') return false
  const expiry = new Date(voucher.expires_at)
  if (Number.isNaN(expiry.getTime())) return false
  return expiry.getTime() <= now.getTime()
}

export interface VoucherCounts {
  total: number
  scannable: number
  redeemed: number
  expired: number
  /** Stored as issued, past its deadline, sweep has not run yet. */
  lapsedUnswept: number
  cancelled: number
  refunded: number
}

export function countVouchers(
  vouchers: readonly { status: string; expires_at: string }[],
  now: Date = new Date(),
): VoucherCounts {
  const counts: VoucherCounts = {
    total: vouchers.length,
    scannable: 0,
    redeemed: 0,
    expired: 0,
    lapsedUnswept: 0,
    cancelled: 0,
    refunded: 0,
  }
  for (const v of vouchers) {
    if (v.status === 'redeemed') counts.redeemed += 1
    else if (v.status === 'expired') counts.expired += 1
    else if (v.status === 'cancelled') counts.cancelled += 1
    else if (v.status === 'refunded') counts.refunded += 1
    else if (isScannable(v, now)) counts.scannable += 1
    else if (isLapsedButUnswept(v, now)) counts.lapsedUnswept += 1
  }
  return counts
}

/** `KE12-3456-7890` from `KE1234567890`, so a code can be read aloud. */
export function formatVoucherCode(code: string): string {
  const clean = code.replace(/\s+/g, '')
  if (clean.length <= 4) return clean
  return clean.replace(/(.{4})/g, '$1-').replace(/-$/, '')
}
