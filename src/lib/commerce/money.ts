declare const agorotBrand: unique symbol

export type Agorot = number & { readonly [agorotBrand]: 'Agorot' }

const ILS_FRACTION_DIGITS = 2
const AGOROT_PER_ILS = 100
const BASIS_POINTS_PER_PERCENT = 100
const BASIS_POINTS_PER_WHOLE = 10_000

function assertSafeInteger(value: number, label: string): asserts value is number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`)
  }
}

export function agorot(value: number): Agorot {
  assertSafeInteger(value, 'agorot')
  return value as Agorot
}

export function ilsToAgorot(value: string | number): Agorot {
  const normalized = typeof value === 'number' ? String(value) : value.trim()
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)

  if (!match) {
    throw new TypeError('ILS value must be a decimal with at most two fraction digits')
  }

  const [, sign, wholePart = '0', fractionPart = ''] = match
  const whole = Number.parseInt(wholePart, 10)
  const fraction = Number.parseInt(fractionPart.padEnd(ILS_FRACTION_DIGITS, '0'), 10)
  const absoluteAgorot = whole * AGOROT_PER_ILS + fraction

  assertSafeInteger(absoluteAgorot, 'ILS value in agorot')
  return agorot(sign === '-' ? -absoluteAgorot : absoluteAgorot)
}

export function agorotToIls(value: Agorot): number {
  assertSafeInteger(value, 'agorot')
  return value / AGOROT_PER_ILS
}

const ilsFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: ILS_FRACTION_DIGITS,
  maximumFractionDigits: ILS_FRACTION_DIGITS,
})

export function formatIls(value: Agorot): string {
  return ilsFormatter.format(agorotToIls(value))
}

export function sumAgorot(values: readonly Agorot[]): Agorot {
  return agorot(
    values.reduce((total, value) => {
      const next = total + value
      assertSafeInteger(next, 'agorot sum')
      return next
    }, 0),
  )
}

export function multiplyAgorot(value: Agorot, quantity: number): Agorot {
  assertSafeInteger(quantity, 'quantity')
  const result = value * quantity
  assertSafeInteger(result, 'agorot multiplication')
  return agorot(result)
}

export function percentToBasisPoints(percent: string | number): number {
  const basisPoints = ilsToAgorot(percent)

  if (basisPoints < 0 || basisPoints > BASIS_POINTS_PER_WHOLE) {
    throw new RangeError('percent must be between 0 and 100')
  }

  return basisPoints
}

export function percentageOf(value: Agorot, basisPoints: number): Agorot {
  assertSafeInteger(basisPoints, 'basis points')

  if (basisPoints < 0 || basisPoints > BASIS_POINTS_PER_WHOLE) {
    throw new RangeError('basis points must be between 0 and 10000')
  }

  const product = value * basisPoints
  assertSafeInteger(product, 'percentage product')

  const rounded =
    product >= 0
      ? Math.floor((product + BASIS_POINTS_PER_WHOLE / 2) / BASIS_POINTS_PER_WHOLE)
      : Math.ceil((product - BASIS_POINTS_PER_WHOLE / 2) / BASIS_POINTS_PER_WHOLE)

  return agorot(rounded)
}

export const moneyConstants = {
  agorotPerIls: AGOROT_PER_ILS,
  basisPointsPerPercent: BASIS_POINTS_PER_PERCENT,
  basisPointsPerWhole: BASIS_POINTS_PER_WHOLE,
} as const
