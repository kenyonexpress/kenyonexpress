import { type Agorot, applyBp, bp } from '@/lib/money'

/**
 * Affiliate commission, the TypeScript twin of fn_affiliate_record_conversion
 * (migration 188). The database snapshots the rate and the result on the
 * conversion row; this module computes the platform share that goes IN and
 * previews the commission for the affiliate dashboard. Integer agorot and
 * basis points only, via money.ts.
 */

/** Platform share of one order line: price x the per-product platform_percent snapshot. */
export function platformShareOfLine(lineAgorot: Agorot, platformPercentBp: number): Agorot {
  return applyBp(lineAgorot, bp(platformPercentBp))
}

/** Commission owed on a platform share at the campaign's rate. */
export function affiliateCommission(platformShare: Agorot, commissionBp: number): Agorot {
  return applyBp(platformShare, bp(commissionBp))
}
