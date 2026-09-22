/**
 * Coupon-deal impact: usage per product and the on-site revenue those
 * vouchers actually collected.
 *
 * PURE. The admin page supplies the voucher rows; this file only folds them.
 * Platform revenue is the coupon price paid on the site, never the till
 * remainder and never a redeemed-vs-issued mix: a voucher that was refunded
 * or cancelled did not stay as revenue.
 */

export type CouponImpactVoucher = {
  productId: string
  productName: string
  status: string
  couponPriceAgorot: number
}

export type CouponImpactProduct = {
  productId: string
  productName: string
  issued: number
  redeemed: number
  refunded: number
  platformRevenueAgorot: number
}

export type CouponImpact = {
  products: CouponImpactProduct[]
  issued: number
  redeemed: number
  refunded: number
  platformRevenueAgorot: number
}

const COUNTED = new Set(['issued', 'redeemed'])

export function couponImpact(rows: readonly CouponImpactVoucher[]): CouponImpact {
  const byProduct = new Map<string, CouponImpactProduct>()

  for (const row of rows) {
    const current = byProduct.get(row.productId) ?? {
      productId: row.productId,
      productName: row.productName,
      issued: 0,
      redeemed: 0,
      refunded: 0,
      platformRevenueAgorot: 0,
    }
    if (row.status === 'redeemed') current.redeemed += 1
    if (row.status === 'issued') current.issued += 1
    if (row.status === 'refunded') current.refunded += 1
    if (COUNTED.has(row.status)) {
      current.platformRevenueAgorot += Math.max(0, row.couponPriceAgorot)
    }
    byProduct.set(row.productId, current)
  }

  const products = [...byProduct.values()].sort(
    (a, b) => b.platformRevenueAgorot - a.platformRevenueAgorot,
  )

  return {
    products,
    issued: products.reduce((sum, row) => sum + row.issued, 0),
    redeemed: products.reduce((sum, row) => sum + row.redeemed, 0),
    refunded: products.reduce((sum, row) => sum + row.refunded, 0),
    platformRevenueAgorot: products.reduce((sum, row) => sum + row.platformRevenueAgorot, 0),
  }
}
