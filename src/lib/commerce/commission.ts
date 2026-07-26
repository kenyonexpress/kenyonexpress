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
  /** Physical only: mandatory split percent. Coupon lines ignore it entirely. */
  platformPercent?: string | number | null
  cashbackPercent: string | number
  /**
   * Coupon only: the ABSOLUTE per-unit amount the customer pays on site, set by
   * the admin on the product (products.coupon_price_ils). Required for coupon
   * lines; never derived from a percent (final business rules, 2026-07-24).
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
  if (
    line.productType === 'physical' &&
    (line.platformPercent === undefined || line.platformPercent === null)
  ) {
    throw new TypeError(
      `platform percent is required for physical line ${line.id} (no default exists)`,
    )
  }
  // A coupon's percent is not part of its pricing model; 0 bps is reported so
  // no percent-derived math can sneak back in.
  const platformPercentBps =
    line.productType === 'coupon'
      ? 0
      : percentToBasisPoints(line.platformPercent as string | number)
  const cashbackPercentBps = percentToBasisPoints(line.cashbackPercent)

  // R1 (final rules 2026-07-24): the coupon on-site charge is the admin-set
  // absolute coupon price, never a percent of face. A coupon line without it
  // cannot be priced; refusing beats inventing a number.
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

  // R2: physical commission is rounded once on the complete line total.
  // Coupon revenue is exactly the amount charged on site.
  const platformFee =
    line.productType === 'coupon' ? customerPaysNow : percentageOf(faceValue, platformPercentBps)
  const supplierDue = line.productType === 'coupon' ? agorot(0) : agorot(faceValue - platformFee)

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
    platformPercentBps,
    platformFee,
    supplierDue,
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
    supplierDue,
    cashbackAmount,
    walletApplied,
    cardCharge,
  }
}
