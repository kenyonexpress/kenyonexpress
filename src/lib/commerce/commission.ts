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
   * Mandatory on BOTH product types since the 2026-07-27 ruling. There is no
   * default anywhere (C1). On a physical line it splits the full charge; on a
   * coupon line it splits the on-site prepayment only (C5).
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
   * Coupon only: the supplier's share of the prepayment, held internally until
   * the voucher is redeemed and released then. Zero on physical lines.
   *
   * "Held" is a row in our own ledger and nothing more (C3). The money sits in
   * our Cardcom account; there is no third-party escrow agent, no J5, and no
   * hold placed on the customer's card.
   */
  escrowHeld: Agorot
  /** Everything the supplier is eventually owed: immediate + held. */
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
  escrowHeld: Agorot
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

  // Required on both types since 2026-07-27. Previously coupon lines reported
  // 0 bps because the platform kept the whole prepayment; under the escrow
  // model the percent is what decides how the prepayment divides, so a missing
  // one is unpriceable rather than harmless.
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

  // R2: commission is rounded once, on the complete line total, and the base
  // differs by type. Physical splits the full charge; a coupon splits only the
  // prepayment (C5), never the face value, because the balance is collected in
  // cash at the business and never passes through us.
  const commissionBase = line.productType === 'coupon' ? customerPaysNow : faceValue
  const platformFee = percentageOf(commissionBase, platformPercentBps)

  // R5 (2026-07-27, C11 version b): the supplier's share of a coupon is held
  // rather than transferred, and released when the voucher is redeemed. Under
  // the abolished 24.07 rule this was zero and the platform kept everything.
  const supplierShare = agorot(commissionBase - platformFee)
  const supplierImmediate = line.productType === 'coupon' ? agorot(0) : supplierShare
  const escrowHeld = line.productType === 'coupon' ? supplierShare : agorot(0)

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
    supplierImmediate,
    escrowHeld,
    supplierDue: agorot(supplierImmediate + escrowHeld),
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
  const escrowHeld = sumAgorot(lines.map((line) => line.escrowHeld))
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
    escrowHeld,
    supplierDue,
    cashbackAmount,
    walletApplied,
    cardCharge,
  }
}
