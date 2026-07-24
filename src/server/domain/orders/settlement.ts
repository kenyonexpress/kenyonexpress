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
 * Order-persistence settlement under the FINAL business rules (2026-07-24,
 * STATE.md Business Rules; they supersede every earlier escrow/upfront draft):
 *
 * - Coupon: the customer pays the ABSOLUTE admin-set coupon price on site
 *   (products.coupon_price_ils), all of it stays with the platform, the
 *   remainder is collected at the business on scan and the voucher then
 *   expires. NO escrow, NO supplier payout for coupon lines.
 * - Physical: the customer pays the full face value on site; the split is
 *   platform_percent (per product, snapshotted to order_items at purchase,
 *   no default anywhere) to the platform, remainder to the supplier.
 *
 * There is NO default commission and NO default coupon price. A line that
 * reaches this engine without its mandatory value is a bug, not a case to
 * paper over with a constant.
 */
export interface SettlementLineInput {
  id: string
  productType: CommissionProductType
  unitPrice: Agorot
  quantity: number
  /** Coupon only: absolute per-unit on-site price in agorot. Required for coupon lines. */
  couponPriceUnit?: Agorot
  /** Physical commission percent (products.platform_percent). Required for physical lines. */
  platformPercent?: string | number
  cashbackPercent?: string | number
}

/** Per-unit money snapshot, used to stamp each issued voucher. */
export interface VoucherUnitAmounts {
  faceValue: Agorot
  paidOnSite: Agorot
  balanceDue: Agorot
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
  /** Physical only; 0 (never derived) for coupon lines. */
  platformPercentBps: number
  /**
   * Platform take. Coupon: equals paidOnSite (everything stays on the
   * platform). Physical: platform_percent of face.
   */
  commission: Agorot
  /** Physical only: owed to the supplier from the on-site charge. */
  supplierDue: Agorot
  /** Coupon only: one entry per purchased unit, for voucher issuance. */
  perUnitVoucher: readonly VoucherUnitAmounts[]
  cashbackAmount: Agorot
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
 * Splits line totals into per-unit integers so each issued voucher carries its
 * own exact money snapshot. Sums always equal the line totals; the first unit
 * absorbs rounding remainders. Conservation per unit is asserted because a
 * voucher whose face != paid + balance would mischarge at the counter.
 */
function splitVoucherUnits(
  quantity: number,
  faceValue: Agorot,
  paidOnSite: Agorot,
): VoucherUnitAmounts[] {
  const baseFace = Math.floor(faceValue / quantity)
  const basePaid = Math.floor(paidOnSite / quantity)
  const units: VoucherUnitAmounts[] = []

  for (let i = 0; i < quantity; i += 1) {
    const face = agorot(i === 0 ? faceValue - baseFace * (quantity - 1) : baseFace)
    const paid = agorot(i === 0 ? paidOnSite - basePaid * (quantity - 1) : basePaid)
    if (paid > face) {
      throw new RangeError('per-unit paid amount must not exceed per-unit face value')
    }
    units.push({ faceValue: face, paidOnSite: paid, balanceDue: agorot(face - paid) })
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

  if (line.productType === 'coupon') {
    if (line.couponPriceUnit === undefined || line.couponPriceUnit === null) {
      throw new TypeError(`coupon price is required for coupon line ${line.id} (no default exists)`)
    }
    if (line.couponPriceUnit <= 0 || line.couponPriceUnit > line.unitPrice) {
      throw new RangeError(
        `coupon price for line ${line.id} must be positive and at most the unit price`,
      )
    }

    const paidOnSite = multiplyAgorot(line.couponPriceUnit, line.quantity)
    const cashbackBps = percentToBasisPoints(line.cashbackPercent ?? 0)

    return {
      id: line.id,
      productType: line.productType,
      quantity: line.quantity,
      faceValue,
      paidOnSite,
      balanceDueAtBusiness: agorot(faceValue - paidOnSite),
      platformPercentBps: 0,
      // Everything paid on site stays with the platform; the supplier's
      // consideration is the balance collected at the counter.
      commission: paidOnSite,
      supplierDue: agorot(0),
      perUnitVoucher: splitVoucherUnits(line.quantity, faceValue, paidOnSite),
      cashbackAmount: percentageOf(paidOnSite, cashbackBps),
    }
  }

  if (line.platformPercent === undefined || line.platformPercent === null) {
    throw new TypeError(
      `platform percent is required for physical line ${line.id} (no default exists)`,
    )
  }
  const platformPercentBps = percentToBasisPoints(line.platformPercent)
  const cashbackBps = percentToBasisPoints(line.cashbackPercent ?? 0)

  const commission = percentageOf(faceValue, platformPercentBps)

  return {
    id: line.id,
    productType: line.productType,
    quantity: line.quantity,
    faceValue,
    paidOnSite: faceValue,
    balanceDueAtBusiness: agorot(0),
    platformPercentBps,
    commission,
    supplierDue: agorot(faceValue - commission),
    perUnitVoucher: [],
    cashbackAmount: percentageOf(faceValue, cashbackBps),
  }
}

/**
 * Invariants, per line and in total:
 * - faceValue = paidOnSite + balanceDueAtBusiness
 * - physical: paidOnSite = commission + supplierDue
 * - coupon: paidOnSite = commission, supplierDue = 0, and the per-unit
 *   snapshots sum exactly to the line totals
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
  const supplierDue = sumAgorot(lines.map((l) => l.supplierDue))
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
    supplierDue,
    cashbackAmount,
    walletApplied,
    cardCharge: agorot(paidOnSite - walletApplied),
  }
}
