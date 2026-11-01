/**
 * Which product may be sold as a gift card.
 *
 * A gift card is stored value. Migration 234 and `gift-card-issue.ts` assume
 * four things about the product behind one, and nothing in the database
 * enforces any of them, so the switch that turns the flag on has to:
 *
 *   no supplier        A gift-card line never reaches the supplier split.
 *                      Finalize keeps it out precisely because it has no
 *                      supplier; one with a supplier would be paid out as if
 *                      a business had sold something.
 *   platform 100%      The whole charge is platform revenue, which redemption
 *                      later converts into wallet credit. Any other share
 *                      leaves part of the face value unaccounted for.
 *   not a coupon       A coupon is a prepayment with a balance collected at a
 *                      counter. A card has no counter.
 *   sold at par        The price IS the face value. A card priced under its
 *                      full price mints credit worth more than was paid.
 *
 * Pure: the action reads the row and asks here. Returns the reason in Hebrew,
 * for the admin, or null when the product qualifies. Turning the flag OFF is
 * always allowed and is not this function's business.
 */

export type GiftCardCandidate = {
  supplier_id: string | null
  platform_percent: number | string | null
  is_coupon_enabled: boolean | null
  type: string | null
  kenyon_price: number | string | null
  full_price: number | string | null
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function giftCardProductRefusal(product: GiftCardCandidate): string | null {
  if (product.supplier_id) {
    return 'גיפט קארד נמכר על ידי האתר עצמו. יש להסיר את הספק מהמוצר לפני הסימון.'
  }
  if (toNumber(product.platform_percent) !== 100) {
    return 'בגיפט קארד כל התשלום הוא הכנסת האתר. יש לקבוע אחוז פלטפורמה 100 לפני הסימון.'
  }
  if (product.is_coupon_enabled || product.type === 'coupon') {
    return 'מוצר שנמכר כקופון אינו יכול להיות גיפט קארד.'
  }
  if (product.type === 'recurring') {
    return 'מנוי אינו יכול להיות גיפט קארד.'
  }
  const price = toNumber(product.kenyon_price)
  if (price === null || price <= 0) {
    return 'לגיפט קארד חייב להיות מחיר. המחיר הוא הערך שייטען לארנק.'
  }
  const full = toNumber(product.full_price)
  if (full !== null && full !== price) {
    return 'גיפט קארד נמכר בערכו המלא. המחיר והמחיר המלא חייבים להיות זהים, או שהמחיר המלא ריק.'
  }
  return null
}
