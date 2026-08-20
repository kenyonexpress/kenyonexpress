/**
 * Agorot for the Edge runtime.
 *
 * `src/lib/money.ts` is the project's single money path and this is not a
 * replacement for it. It is a deliberate twin of the one function an Edge
 * Function needs, written for the same reason `emails/format.ts` is a twin: the
 * Next module resolves through the `@/` alias and pulls in the rest of the
 * commerce layer, and a function bundle cannot reach it.
 * `src/lib/notifications/edge-parity.test.ts` asserts this agrees with
 * `ilsToAgorot` across the cases that matter, so a divergence fails CI.
 *
 * WHY THIS PARSES A STRING INSTEAD OF MULTIPLYING BY 100. `19.99 * 100` is
 * `1998.9999999999998` in IEEE 754, and `Math.round` hides it for most values
 * and not for all of them. The project rule is integer agorot with no float on
 * the money path; the digits are read out of the decimal instead, which cannot
 * be off by one.
 *
 * WHY IT ACCEPTS ANYTHING AND RETURNS NULL. Every caller is rendering an email
 * from a row it did not write. A malformed amount must produce a mail with no
 * amount in it, not a 500 that leaves a customer with no confirmation at all.
 * `formatAgorot(null)` already renders `—`.
 */

const AGOROT_PER_ILS = 100

/**
 * A numeric-ILS column as integer agorot, or null.
 *
 * PostgREST returns `numeric` as a JSON number, so the argument is usually a
 * number and `String(value)` is exact for every value a price column can hold
 * (two decimal places).
 */
export function ilsToAgorot(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const normalized = typeof value === 'number' ? String(value) : value.trim()
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return null

  const [, sign, wholePart = '0', fractionPart = ''] = match
  const whole = Number.parseInt(wholePart, 10)
  const fraction = Number.parseInt(fractionPart.padEnd(2, '0'), 10)
  const absolute = whole * AGOROT_PER_ILS + fraction

  if (!Number.isSafeInteger(absolute)) return null
  return sign === '-' ? -absolute : absolute
}

/**
 * The amount off a row that may carry either spelling.
 *
 * This project's `orders` carry `total_ils` and the migrated lineage carries
 * `total_agorot`; `095`'s trigger reads both out of `to_jsonb(NEW)` for exactly
 * this reason, and naming one of them here would make the email blank on the
 * other deployment. Agorot wins when both are present: it is the integer.
 */
export function agorotFromRow(
  row: Record<string, unknown> | null | undefined,
  agorotColumn: string,
  ilsColumn: string,
): number | null {
  if (!row) return null

  const direct = row[agorotColumn]
  if (typeof direct === 'number' && Number.isSafeInteger(direct)) return direct
  if (typeof direct === 'string') {
    const parsed = Number.parseInt(direct, 10)
    if (Number.isSafeInteger(parsed)) return parsed
  }

  const ils = row[ilsColumn]
  if (typeof ils === 'number' || typeof ils === 'string') return ilsToAgorot(ils)
  return null
}

/** Integer addition only. Nulls are skipped; all-null sums to null, not to 0. */
export function sumAgorot(values: readonly (number | null)[]): number | null {
  let total = 0
  let seen = false
  for (const value of values) {
    if (value == null) continue
    seen = true
    total += value
  }
  return seen ? total : null
}
