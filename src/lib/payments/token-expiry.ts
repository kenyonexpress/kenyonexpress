/**
 * Whether a saved card token has passed its expiry.
 *
 * A card marked 07/26 is valid through the LAST day of July 2026, not the
 * first. Comparing against the start of the stated month is the classic
 * off-by-one that declines a perfectly good card for up to 31 days, so the
 * cutoff is the start of the FOLLOWING month.
 *
 * A token missing either half of the date is treated as not expired: the
 * expiry columns are nullable, and refusing to charge on absent data would
 * block a card Cardcom would happily accept. Cardcom is the authority on
 * whether the card is live; this check only avoids sending it a charge that
 * cannot possibly succeed.
 */
export function isCardTokenExpired(
  expiryMonth: number | null | undefined,
  expiryYear: number | null | undefined,
  now: Date,
): boolean {
  if (expiryMonth == null || expiryYear == null) return false
  if (!Number.isInteger(expiryMonth) || expiryMonth < 1 || expiryMonth > 12) return false
  if (!Number.isInteger(expiryYear) || expiryYear < 1) return false

  // Two-digit years as Cardcom sometimes reports them (26 meaning 2026).
  const year = expiryYear < 100 ? 2000 + expiryYear : expiryYear

  // Date.UTC rolls month 12 into January of the next year on its own.
  const expiresAt = Date.UTC(year, expiryMonth, 1)
  return now.getTime() >= expiresAt
}
