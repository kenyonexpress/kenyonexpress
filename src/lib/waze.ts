/**
 * Waze deep links, built from a written address.
 *
 * WHY `q=` AND NOT `ll=`. `docs/PRODUCT-PAGE-SPEC.md` derives the Waze link
 * from `suppliers.lat/lng` with zero drift. Those columns do not exist: they
 * are what `supabase/migrations/136_supplier_coordinates.sql` adds, and
 * it is unapplied ([67]). Naming a column this database lacks fails the WHOLE query
 * with 42703, so the coordinates are not merely unavailable, they cannot be
 * selected. `q=` is Waze's own address search and it is what the data supports
 * today; when 110 lands, `ll=` should replace it here and nowhere else.
 *
 * WHY A STREET ADDRESS IS REQUIRED. `q=חיפה` opens navigation to a city centre.
 * That is not where a coupon is redeemed, and a navigation button that confidently
 * lands somewhere else is worse than no button. City alone therefore returns
 * null, and the caller prints the city as text.
 */

/** `https://waze.com/ul?q=<address>&navigate=yes`, or null when there is no address. */
export function wazeSearchLink(
  address: string | null | undefined,
  city?: string | null,
): string | null {
  const street = address?.trim()
  if (!street) return null

  const town = city?.trim()
  // The city is appended only when the address does not already carry it, so a
  // supplier who typed "הרצל 5, חיפה" into the address field is not sent to
  // "הרצל 5, חיפה, חיפה" -- Waze scores a repeated token as a different place.
  const query = town && !street.includes(town) ? `${street}, ${town}` : street

  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`
}
