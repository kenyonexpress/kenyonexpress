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
   * On a PHYSICAL line it is the split: the platform takes this percent of the
   * full charge and the rest settles to the supplier immediately.
   *
   * On a COUPON line it does not divide anything, because the platform keeps
   * the whole on-site prepayment. It stays required so the catalog invariant
   * holds one way for every product and a mispriced product fails loudly
   * instead of selling at an accidental split.
   */
  platformPercent?: string | number | null
  cashbackPercent: string | number
  /**
   * Coupon only: the ABSOLUTE per-unit amount the customer pays on site, set by
   * the admin on the product (products.coupon_price_ils). Required for coupon
   * lines; never derived from a percent, because deriving it is exactly how the
   * quote and the charge came apart before (see lib/commerce/coupon-offer.ts).
   */
  couponPriceUnit?: Agorot
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
   * Physical only: the supplier's share of a full on-site payment, transferred
   * as part of the same settlement. Zero on coupon lines.
   */
  supplierImmediate: Agorot
  /**
   * Everything the supplier is owed from the platform. Equals supplierImmediate:
   * there is no deferred component, because a coupon owes the supplier nothing
   * from us. What the supplier earns on a coupon is the balance the customer
   * hands over at the counter, which never passes through the platform.
   */
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

function calculateLine(line: CommissionLineInput): CommissionLineResult {
  if (!line.id.trim()) {
    throw new TypeError('line id is required')
  }
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new RangeError('quantity must be a positive safe integer')
  }

  assertNonNegative(line.unitPrice, 'unit price')

  const faceValue = multiplyAgorot(line.unitPrice, line.quantity)

  // Required on both types. A physical line is unpriceable without it, and a
  // coupon product that reached checkout without one was mis-configured in
  // admin, so refusing is better than shipping a silent split.
  if (line.platformPercent === undefined || line.platformPercent === null) {
    throw new TypeError(
      `platform percent is required for ${line.productType} line ${line.id} (no default exists)`,
    )
  }
  const platformPercentBps = percentToBasisPoints(line.platformPercent)
  const cashbackPercentBps = percentToBasisPoints(line.cashbackPercent)

  // R1: the coupon on-site charge is the admin-set absolute coupon price, never
  // a percent of face. A coupon line without it cannot be priced; refusing
  // beats inventing a number.
  if (line.productType === 'coupon') {
    if (line.couponPriceUnit === undefined || line.couponPriceUnit === null) {
      throw new TypeError(`coupon price is required for coupon line ${line.id} (no default exists)`)
    }
    if (line.couponPriceUnit <= 0 || line.couponPriceUnit > line.unitPrice) {
      throw new RangeError(
        `coupon price for line ${line.id} must be positive and at most the unit price`,
      )
    }
  }
  const customerPaysNow =
    line.productType === 'coupon'
      ? multiplyAgorot(line.couponPriceUnit as Agorot, line.quantity)
      : faceValue
  const balanceDueAtBusiness =
    line.productType === 'coupon' ? agorot(faceValue - customerPaysNow) : agorot(0)

  // Coupon: the platform keeps the entire on-site prepayment. Nothing is split,
  // nothing is held, and the supplier is paid nothing by us for the line. The
  // balance the customer pays at the counter is the supplier's revenue and is
  // collected directly, never through our clearing account.
  //
  // Physical: the platform takes platformPercent of the full charge, rounded
  // once on the complete line total, and the residual settles to the supplier
  // in the same run. The residual is gross minus fee rather than the mirror
  // percent applied a second time, so the two halves can never disagree.
  const isCoupon = line.productType === 'coupon'
  const platformFee = isCoupon ? customerPaysNow : percentageOf(faceValue, platformPercentBps)
  const supplierImmediate = isCoupon ? agorot(0) : agorot(faceValue - platformFee)

  // R3: cashback uses customerPaysNow only and is merely snapshotted here.
  // Lifecycle handlers credit it after redemption or shipment.
  const cashbackAmount = percentageOf(customerPaysNow, cashbackPercentBps)

  return {
    id: line.id,
    productType: line.productType,
    quantity: line.quantity,
    faceValue,
    customerPaysNow,
    balanceDueAtBusiness,
    // A coupon's effective platform share of the prepayment is the whole of it.
    // Reporting the product's configured percent here would describe a split
    // that did not happen, and this value is what gets snapshotted downstream.
    platformPercentBps: isCoupon ? 10_000 : platformPercentBps,
    platformFee,
    supplierImmediate,
    supplierDue: supplierImmediate,
    cashbackPercentBps,
    cashbackAmount,
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

  // R4: wallet is a payment source. It reduces only the card charge and never
  // mutates line settlement, commission, supplier due, or cashback snapshots.
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
