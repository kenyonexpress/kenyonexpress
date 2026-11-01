/**
 * The result-count line under and above a listing, in the live site's wording.
 *
 * A plain module because three callers need the same sentence: the category
 * page, the shop page, and the infinite grid, which is a client component and
 * rewrites the line as it appends pages.
 */
export function resultCountText(total: number, from: number, to: number): string {
  if (total === 1) return 'מציג תוצאה יחידה'
  if (to - from + 1 >= total) return `מציגים את כל ⁦${total}⁩ התוצאות`
  return `מציג ${from}–${to} מתוך ${total} תוצאות`
}
