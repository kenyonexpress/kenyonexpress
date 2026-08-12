import {
  type Agorot,
  agorot,
  multiplyAgorot,
  percentToBasisPoints,
  percentageOf,
  sumAgorot,
} from './money'

export type CommissionProductType = 'coupon' | 'physical'

export interface CommissionLineInput {
  id: string
  productType: CommissionProductType
  unitPrice: Agorot
  quantity: number
  /**
   * Mandatory on BOTH product types. There is no default anywhere (C1).
   *
   * On both types it splits whatever the customer pays on site: the platform
   * takes this percent and the residual settles to the supplier. A coupon where
   * the platform keeps everything is expressible as platform_percent = 100.
   */
  platformPercent?: string | number | null
  cashbackPercent: string | number
  /**
   * Coupon only: the ABSOLUTE per-unit amount the customer pays on site, set by
   * the admin on the product (products.coupon_price_ils). Required for coupon
   * lines; never derived from a percent.
   */
  couponPriceUnit?: Agorot
  /**
   * Physical only: products.discount_percent. Reduces the on-site charge off
   * the sticker (unitPrice). Ignored on coupons (coupon_price_ils is absolute).
   */
  discountPercent?: string | number | null
}

export interface CommissionInput {
  idempotencyKey: string
  lines: readonly CommissionLineInput[]
  walletApplied?: Agorot
}

export interface CommissionLineResult {
  id: string
  productType: CommissionProductType
  quantity: number
  faceValue: Agorot
  customerPaysNow: Agorot
  balanceDueAtBusiness: Agorot
  platformPercentBps: number
  platformFee: Agorot
  /**
   * Supplier share of the on-site charge, residual of platformFee. Immediate on
   * both types under ADMIN-ARCHITECTURE §0 (no escrow).
   */
  supplierImmediate: Agorot
  /** Same as supplierImmediate: nothing is deferred. */
  supplierDue: Agorot
  cashbackPercentBps: number
  cashbackAmount: Agorot
}

export interface CommissionResult {
  idempotencyKey: string
  lines: readonly CommissionLineResult[]
  faceValue: Agorot
  customerPaysNow: Agorot
  balanceDueAtBusiness: Agorot
  platformFee: Agorot
  supplierImmediate: Agorot
  supplierDue: Agorot
  cashbackAmount: Agorot
  walletApplied: Agorot
  cardCharge: Agorot
}

function assertNonNegative(value: Agorot, label: string): void {
  if (value < 0) {
    throw new RangeError(`${label} must not be negative`)
  }
}

/**
 * Sticker minus discount_percent, integer-safe. discount 0 or missing = face.
 * The residual form (face - fee) matches settlement so cart and checkout agree.
 */
export function applyDiscountAgorot(
  face: Agorot,
  discountPercent: string | number | null | undefined,
): Agorot {
  if (discountPercent === undefined || discountPercent === null || discountPercent === '') {
    return face
  }
  const discountBps = percentToBasisPoints(discountPercent)
  if (discountBps <= 0) return face
  if (discountBps >= 10_000) {
    throw new RangeError('discount percent must be less than 100')
  }
  return agorot(face - percentageOf(face, discountBps))
}

function calculateLine(line: CommissionLineInput): CommissionLineResult {
  if (!line.id.trim()) {
    throw new TypeError('line id is required')
  }
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new RangeError('quantity must be a positive safe integer')
  }

  assertNonNegative(line.unitPrice, 'unit price')

  const stickerFace = multiplyAgorot(line.unitPrice, line.quantity)

  if (line.platformPercent === undefined || line.platformPercent === null) {
    throw new TypeError(
      `platform percent is required for ${line.productType} line ${line.id} (no default exists)`,
    )
  }
  const platformPercentBps = percentToBasisPoints(line.platformPercent)
  const cashbackPercentBps = percentToBasisPoints(line.cashbackPercent)

  if (line.productType === 'coupon') {
    if (line.couponPriceUnit === undefined || line.couponPriceUnit === null) {
      throw new TypeError(`coupon price is required for coupon line ${line.id} (no default exists)`)
    }
    if (line.couponPriceUnit <= 0 || line.couponPriceUnit > line.unitPrice) {
      throw new RangeError(
        `coupon price for line ${line.id} must be positive and at most the unit price`,
      )
    }
    const customerPaysNow = multiplyAgorot(line.couponPriceUnit, line.quantity)
    const balanceDueAtBusiness = agorot(stickerFace - customerPaysNow)
    // Split the prepayment only (ADMIN §0.3). Never the face: the balance is
    // cash at the counter and never reaches us.
    const platformFee = percentageOf(customerPaysNow, platformPercentBps)
    const supplierImmediate = agorot(customerPaysNow - platformFee)

    return {
      id: line.id,
      productType: line.productType,
      quantity: line.quantity,
      faceValue: stickerFace,
      customerPaysNow,
      balanceDueAtBusiness,
      platformPercentBps,
      platformFee,
      supplierImmediate,
      supplierDue: supplierImmediate,
      cashbackPercentBps,
      cashbackAmount: percentageOf(customerPaysNow, cashbackPercentBps),
    }
  }

  const customerPaysNow = applyDiscountAgorot(stickerFace, line.discountPercent)
  const platformFee = percentageOf(customerPaysNow, platformPercentBps)
  const supplierImmediate = agorot(customerPaysNow - platformFee)

  return {
    id: line.id,
    productType: line.productType,
    quantity: line.quantity,
    // Face follows the charge after discount so cart totals match what the card
    // is billed. The sticker lives on full_price / compare_at for display.
    faceValue: customerPaysNow,
    customerPaysNow,
    balanceDueAtBusiness: agorot(0),
    platformPercentBps,
    platformFee,
    supplierImmediate,
    supplierDue: supplierImmediate,
    cashbackPercentBps,
    cashbackAmount: percentageOf(customerPaysNow, cashbackPercentBps),
  }
}

export function calculateCommission(input: CommissionInput): CommissionResult {
  if (!input.idempotencyKey.trim()) {
    throw new TypeError('idempotency key is required')
  }
  if (input.lines.length === 0) {
    throw new RangeError('at least one commerce line is required')
  }

  const uniqueIds = new Set(input.lines.map((line) => line.id))
  if (uniqueIds.size !== input.lines.length) {
    throw new RangeError('commerce line ids must be unique')
  }

  const lines = input.lines.map(calculateLine)
  const faceValue = sumAgorot(lines.map((line) => line.faceValue))
  const customerPaysNow = sumAgorot(lines.map((line) => line.customerPaysNow))
  const balanceDueAtBusiness = sumAgorot(lines.map((line) => line.balanceDueAtBusiness))
  const platformFee = sumAgorot(lines.map((line) => line.platformFee))
  const supplierImmediate = sumAgorot(lines.map((line) => line.supplierImmediate))
  const supplierDue = sumAgorot(lines.map((line) => line.supplierDue))
  const cashbackAmount = sumAgorot(lines.map((line) => line.cashbackAmount))
  const walletApplied = input.walletApplied ?? agorot(0)

  assertNonNegative(walletApplied, 'wallet applied')
  if (walletApplied > customerPaysNow) {
    throw new RangeError('wallet applied must not exceed customerPaysNow')
  }

  const cardCharge = agorot(customerPaysNow - walletApplied)

  return {
    idempotencyKey: input.idempotencyKey,
    lines,
    faceValue,
    customerPaysNow,
    balanceDueAtBusiness,
    platformFee,
    supplierImmediate,
    supplierDue,
    cashbackAmount,
    walletApplied,
    cardCharge,
  }
}
