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
  platformPercent: string | number
  cashbackPercent: string | number
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
  const platformPercentBps = percentToBasisPoints(line.platformPercent)
  const cashbackPercentBps = percentToBasisPoints(line.cashbackPercent)

  // R1: coupon checkout charges only the product platform percentage.
  // The supplier collects the remaining face value directly at redemption.
  const customerPaysNow =
    line.productType === 'coupon' ? percentageOf(faceValue, platformPercentBps) : faceValue
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
