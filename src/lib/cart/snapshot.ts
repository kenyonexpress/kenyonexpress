/**
 * Validation for the per-line `platform_percent` snapshot.
 *
 * This lives in its own module rather than inside `server/actions/cart.ts`
 * because that file is `'use server'`: every export there has to be an async
 * server action, so a synchronous helper cannot be exported from it and
 * therefore cannot be tested. The rule being enforced is small but is the one
 * standing between a hand-edited `carts.items` row and a commission rate of the
 * shopper's choosing, so it is worth being able to test directly.
 */

/** The catalogue stores the platform's cut as a whole percent, 0..100. */
const MIN_PERCENT = 0
const MAX_PERCENT = 100

/**
 * Returns the percent if it is a real number inside 0..100, otherwise null.
 *
 * Null is not zero and the difference matters: zero is a valid rate meaning the
 * platform takes nothing, while null means "no rate is on file", which
 * `pricing.ts` turns into an unavailable line rather than a free one (C1: there
 * is no default percent anywhere).
 */
export function parsePercentSnapshot(raw: unknown): number | null {
  // An allow-list of two types, rather than a series of rejections ending in
  // Number(). Number() maps '', '  ', false, null AND [] all to 0, so anything
  // that reaches it by default turns a blank or malformed column into a real
  // rate of zero -- a line the platform earns nothing on. Only a number or a
  // numeric string is a percent; everything else is absence.
  if (typeof raw !== 'number' && typeof raw !== 'string') return null
  if (typeof raw === 'string' && raw.trim() === '') return null

  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (value < MIN_PERCENT || value > MAX_PERCENT) return null
  return value
}
