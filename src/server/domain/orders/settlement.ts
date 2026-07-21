import type { CommissionProductType } from '@/lib/commerce/commission'
import {
  type Agorot,
  agorot,
  multiplyAgorot,
  percentToBasisPoints,
  percentageOf,
  sumAgorot,
} from '@/lib/commerce/money'

/**
 * Platform commission default: 5% of every agora that flows through the
 * platform (the on-site charge). Admin can override per product via
 * products.commission_percent.
 */
export const DEFAULT_PLATFORM_COMMISSION_PERCENT = 5

/** Coupon upfront default when the product has no admin value (products.platform_percent). */
export const DEFAULT_COUPON_UPFRONT_PERCENT = 10

export interface SettlementLineInput {
  id: string
  productType: CommissionProductType
  unitPrice: Agorot
  quantity: number
  /** Coupon only: percent of face value the customer pays on site (products.platform_percent). */
  upfrontPercent?: string | number
  /** Platform commission percent on the on-site amount (products.commission_percent, default 5). */
  commissionPercent?: string | number
  cashbackPercent?: string | number
}

export interface SettlementLineResult {
  id: string
  productType: CommissionProductType
  quantity: number
  faceValue: Agorot
  /** What the customer pays on site for this line. */
  paidOnSite: Agorot
  /** Coupon only: paid directly at the business on redemption. */
  balanceDueAtBusiness: Agorot
  upfrontBps: number
  commissionBps: number
  /** Platform commission on the on-site amount. */
  commission: Agorot
  /** Physical only: released to the supplier at split execution. */
  supplierImmediate: Agorot
  /** Coupon only: held in escrow at finalize (equals paidOnSite). */
  escrowHeld: Agorot
  /** Coupon only: released to the supplier on redemption (escrowHeld - commission). */
  escrowReleaseToSupplier: Agorot
  /** Coupon only: escrow per single unit (quantity divides escrowHeld with remainder on the first unit). */
  perUnitEscrow: readonly EscrowUnitAmounts[]
  cashbackAmount: Agorot
}

export interface EscrowUnitAmounts {
  held: Agorot
  commission: Agorot
  release: Agorot
}

export interface SettlementInput {
  idempotencyKey: string
  lines: readonly SettlementLineInput[]
  walletApplied?: Agorot
}

export interface SettlementResult {
  idempotencyKey: string
  lines: readonly SettlementLineResult[]
  faceValue: Agorot
  paidOnSite: Agorot
  balanceDueAtBusiness: Agorot
  commission: Agorot
  supplierImmediate: Agorot
  escrowHeld: Agorot
  escrowReleaseToSupplier: Agorot
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
 * Splits a line-level escrow amount into per-unit holds so each purchased
 * coupon code carries its own escrow row. Sum of units always equals the line
 * totals exactly; the first unit absorbs rounding remainders.
 */
function splitEscrowPerUnit(
  quantity: number,
  escrowHeld: Agorot,
  commission: Agorot,
): EscrowUnitAmounts[] {
  const baseHeld = Math.floor(escrowHeld / quantity)
  const baseCommission = Math.floor(commission / quantity)
  const units: EscrowUnitAmounts[] = []

  for (let i = 0; i < quantity; i += 1) {
    const held = agorot(i === 0 ? escrowHeld - baseHeld * (quantity - 1) : baseHeld)
    const unitCommission = agorot(
      i === 0 ? commission - baseCommission * (quantity - 1) : baseCommission,
    )
    if (unitCommission > held) {
      throw new RangeError('per-unit commission must not exceed per-unit escrow')
    }
    units.push({
      held,
      commission: unitCommission,
      release: agorot(held - unitCommission),
    })
  }

  return units
}

function calculateLine(line: SettlementLineInput): SettlementLineResult {
  if (!line.id.trim()) {
    throw new TypeError('line id is required')
  }
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new RangeError('quantity must be a positive safe integer')
  }
  assertNonNegative(line.unitPrice, 'unit price')

  const faceValue = multiplyAgorot(line.unitPrice, line.quantity)
  const commissionBps = percentToBasisPoints(
    line.commissionPercent ?? DEFAULT_PLATFORM_COMMISSION_PERCENT,
  )
  const upfrontBps =
    line.productType === 'coupon'
      ? percentToBasisPoints(line.upfrontPercent ?? DEFAULT_COUPON_UPFRONT_PERCENT)
      : percentToBasisPoints(100)
  const cashbackBps = percentToBasisPoints(line.cashbackPercent ?? 0)

  // On-site charge: coupons collect only the upfront percent, physical collects face.
  const paidOnSite = line.productType === 'coupon' ? percentageOf(faceValue, upfrontBps) : faceValue
  const balanceDueAtBusiness =
    line.productType === 'coupon' ? agorot(faceValue - paidOnSite) : agorot(0)

  // Commission is always taken from the money that passed through the platform.
  const commission = percentageOf(paidOnSite, commissionBps)

  const supplierImmediate =
    line.productType === 'physical' ? agorot(faceValue - commission) : agorot(0)
  const escrowHeld = line.productType === 'coupon' ? paidOnSite : agorot(0)
  const escrowReleaseToSupplier =
    line.productType === 'coupon' ? agorot(escrowHeld - commission) : agorot(0)

  const perUnitEscrow =
    line.productType === 'coupon' ? splitEscrowPerUnit(line.quantity, escrowHeld, commission) : []

  const cashbackAmount = percentageOf(paidOnSite, cashbackBps)

  return {
    id: line.id,
    productType: line.productType,
    quantity: line.quantity,
    faceValue,
    paidOnSite,
    balanceDueAtBusiness,
    upfrontBps,
    commissionBps,
    commission,
    supplierImmediate,
    escrowHeld,
    escrowReleaseToSupplier,
    perUnitEscrow,
    cashbackAmount,
  }
}

/**
 * Escrow-aware settlement calculator (supersedes the pre-escrow commission
 * semantics for order persistence; calculateCommission remains the cart-view
 * engine).
 *
 * Invariants, per line and in total:
 * - faceValue = paidOnSite + balanceDueAtBusiness
 * - physical: faceValue = commission + supplierImmediate
 * - coupon: escrowHeld = paidOnSite = commission + escrowReleaseToSupplier
 * - cardCharge = paidOnSite - walletApplied
 */
export function calculateSettlement(input: SettlementInput): SettlementResult {
  if (!input.idempotencyKey.trim()) {
    throw new TypeError('idempotency key is required')
  }
  if (input.lines.length === 0) {
    throw new RangeError('at least one settlement line is required')
  }
  const uniqueIds = new Set(input.lines.map((line) => line.id))
  if (uniqueIds.size !== input.lines.length) {
    throw new RangeError('settlement line ids must be unique')
  }

  const lines = input.lines.map(calculateLine)
  const faceValue = sumAgorot(lines.map((l) => l.faceValue))
  const paidOnSite = sumAgorot(lines.map((l) => l.paidOnSite))
  const balanceDueAtBusiness = sumAgorot(lines.map((l) => l.balanceDueAtBusiness))
  const commission = sumAgorot(lines.map((l) => l.commission))
  const supplierImmediate = sumAgorot(lines.map((l) => l.supplierImmediate))
  const escrowHeld = sumAgorot(lines.map((l) => l.escrowHeld))
  const escrowReleaseToSupplier = sumAgorot(lines.map((l) => l.escrowReleaseToSupplier))
  const cashbackAmount = sumAgorot(lines.map((l) => l.cashbackAmount))
  const walletApplied = input.walletApplied ?? agorot(0)

  assertNonNegative(walletApplied, 'wallet applied')
  if (walletApplied > paidOnSite) {
    throw new RangeError('wallet applied must not exceed the on-site charge')
  }

  return {
    idempotencyKey: input.idempotencyKey,
    lines,
    faceValue,
    paidOnSite,
    balanceDueAtBusiness,
    commission,
    supplierImmediate,
    escrowHeld,
    escrowReleaseToSupplier,
    cashbackAmount,
    walletApplied,
    cardCharge: agorot(paidOnSite - walletApplied),
  }
}
