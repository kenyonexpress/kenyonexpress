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
 * Order-persistence settlement under the FINAL business rules
 * (docs/ADMIN-ARCHITECTURE.md section 0, decided 2026-07-27; they supersede
 * every earlier escrow, upfront and fixed-commission draft):
 *
 * - Coupon: the customer pays the ABSOLUTE admin-set coupon price on site
 *   (products.coupon_price_ils). That prepayment then splits by the product's
 *   own platform_percent, exactly like a physical line. The remainder of the
 *   sticker price is collected in cash at the business on scan, never passes
 *   through us, and the voucher expires. No escrow.
 * - Physical: the customer pays the full on-site charge; the same percent
 *   splits it.
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 *
 * Until 070 this engine hardcoded coupon lines as `commission = paidOnSite,
 * supplierDue = 0`: the platform kept the whole prepayment and the percent was
 * ignored. That was the last fixed commission in the money path, and it made
 * products.platform_percent unreadable on the type that makes up most of the
 * catalog. Both types now read the same knob, so a coupon where the platform
 * keeps everything is still expressible, as platform_percent = 100, but it is
 * one admin choice among many rather than a constant nobody can change.
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
  /**
   * products.platform_percent. Required on BOTH types since 070: on a coupon it
   * splits the prepayment, on a physical the full on-site charge.
   */
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
  /** The product's own platform_percent, in basis points. Set on both types. */
  platformPercentBps: number
  /** Platform take: platform_percent of whatever the customer paid on site. */
  commission: Agorot
  /**
   * Owed to the supplier out of the on-site charge, on both types. Always the
   * residual `paidOnSite - commission`, never a second multiplication, so the
   * two shares add back to exactly what the customer paid.
   */
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

  const cashbackBps = percentToBasisPoints(line.cashbackPercent ?? 0)

  /**
   * Required on both types since 070. A coupon line that reached the old engine
   * without a percent was settled at an implied 100%, which silently assigned
   * the whole prepayment to the platform. Refusing is the only safe reading of a
   * missing split, because the alternative moves someone else's money.
   */
  function requirePlatformPercentBps(): number {
    if (line.platformPercent === undefined || line.platformPercent === null) {
      throw new TypeError(
        `platform percent is required for ${line.productType} line ${line.id} (no default exists)`,
      )
    }
    return percentToBasisPoints(line.platformPercent)
  }

  if (line.productType === 'coupon') {
    if (line.couponPriceUnit === undefined || line.couponPriceUnit === null) {
      throw new TypeError(`coupon price is required for coupon line ${line.id} (no default exists)`)
    }
    if (line.couponPriceUnit <= 0 || line.couponPriceUnit > line.unitPrice) {
      throw new RangeError(
        `coupon price for line ${line.id} must be positive and at most the unit price`,
      )
    }
    const platformPercentBps = requirePlatformPercentBps()

    const paidOnSite = multiplyAgorot(line.couponPriceUnit, line.quantity)
    // The split base is the prepayment only, never the face value. The balance
    // is collected in cash at the counter and never reaches us, so charging a
    // percent on it would bill the supplier for money we never held.
    const commission = percentageOf(paidOnSite, platformPercentBps)

    return {
      id: line.id,
      productType: line.productType,
      quantity: line.quantity,
      faceValue,
      paidOnSite,
      balanceDueAtBusiness: agorot(faceValue - paidOnSite),
      platformPercentBps,
      commission,
      supplierDue: agorot(paidOnSite - commission),
      perUnitVoucher: splitVoucherUnits(line.quantity, faceValue, paidOnSite),
      cashbackAmount: percentageOf(paidOnSite, cashbackBps),
    }
  }

  const platformPercentBps = requirePlatformPercentBps()
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
 * - paidOnSite = commission + supplierDue, on BOTH product types
 * - coupon: the per-unit snapshots sum exactly to the line totals
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
