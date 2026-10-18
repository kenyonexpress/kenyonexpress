/**
 * The location a product shows when it has no city of its own: the deal is
 * valid, or ships, anywhere. Migration 279 wrote it into products.city for
 * physical products, and the storefront prints it for any product whose city
 * is NULL, so both paths read the same words.
 */
export const NATIONWIDE_LABEL = 'כל הארץ'

export function isNationwide(city: string | null | undefined): boolean {
  return typeof city !== 'string' || city.trim() === '' || city.trim() === NATIONWIDE_LABEL
}
