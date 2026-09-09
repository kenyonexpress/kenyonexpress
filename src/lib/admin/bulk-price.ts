import { type Agorot, agorotToIls, ilsToAgorot } from '@/lib/commerce/money'
import { applyBp } from '@/lib/money'

/**
 * A catalogue ILS price -> integer agorot, through the money module.
 *
 * The catalogue columns (`kenyon_price`, `full_price`) are numeric shekels, so
 * a boundary conversion is unavoidable; what is avoidable is doing the
 * arithmetic in floats after it. `toFixed(2)` pins the value to exactly two
 * decimals as a STRING and `ilsToAgorot` parses that exactly, so the only
 * rounding is the explicit half-up one and everything after it is integer.
 */
export function catalogueIlsToAgorot(value: unknown): Agorot | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  try {
    return ilsToAgorot(parsed.toFixed(2))
  } catch {
    return null
  }
}

/**
 * Scale a catalogue ILS price by a percent delta (-10 means "10% off"),
 * entirely in integer agorot through applyBp -- the project's single
 * multiply-by-rate primitive. Returns the new ILS value for the numeric
 * column, or null when the input is not a usable price.
 *
 * (100 + percent)% as basis points: -10% -> 9000, +25% -> 12500. applyBp
 * accepts a plain non-negative integer, so factors above 100% (which bp()
 * would reject) are fine; callers must keep percent above -100.
 */
export function scaleCatalogueIls(value: unknown, percent: number): number | null {
  const currentAgorot = catalogueIlsToAgorot(value)
  if (currentAgorot == null) return null
  const factorBp = Math.round((100 + percent) * 100)
  if (factorBp < 0) return null
  return agorotToIls(applyBp(currentAgorot, factorBp))
}
