import type { Agorot } from '@/lib/money'

const AGOROT_PER_ILS = 100

/**
 * The one way this project renders money, and the reason it is only one.
 *
 * There were SIX functions called `shekels` in `src/`, and they did not agree
 * on what they took. Three read agorot (`lib/cart/format`, the redeem page, the
 * admin reports page) and three read shekels (admin analytics, `SalesChart`,
 * `lib/admin/payouts`). Same name, same output, opposite contracts -- so moving
 * a value between two of those screens, or copying one call, was a silent 100x
 * error waiting to be made, and the header of the cart's own formatter records
 * that this project has already paid for exactly that once: four components
 * each had a private formatter that assumed shekels, the builder underneath
 * returned agorot, and two wrongs agreed on screen for weeks.
 *
 * So: agorot in, always, at every call site. The three that genuinely hold
 * shekels now call theirs `shekelsFromIls`, which cannot be confused with this.
 *
 * Built by integer division rather than by `agorotToIls`, so no money value is
 * ever a float even for the length of a format call: the whole shekels and the
 * agorot remainder are separated with `/` and `%` on the integer, and only the
 * already-whole shekel part is handed to Intl for thousands grouping. That
 * keeps "integer agorot, end to end" true of the display layer as well, and not
 * merely of the arithmetic behind it. Two of the copies this replaces did
 * `agorot / 100` and formatted the float.
 *
 * The glyph is written literally instead of using `Intl.NumberFormat`'s ILS
 * currency style, which emits directional marks around the sign. Inside an RTL
 * document those marks reorder a price sitting next to Hebrew text, and the
 * live site the store is measured against prints the bare glyph. That is also
 * why `formatIls` in `lib/commerce/money.ts` is not the answer here: it is the
 * correct formatter for a log line or a document, and the wrong one for a page.
 */
export function shekels(value: Agorot): string {
  const negative = value < 0
  const absolute = Math.abs(value)
  const whole = Math.trunc(absolute / AGOROT_PER_ILS)
  const fraction = absolute % AGOROT_PER_ILS
  const grouped = whole.toLocaleString('he-IL', { useGrouping: true })
  return `${negative ? '-' : ''}₪${grouped}.${String(fraction).padStart(2, '0')}`
}

/**
 * The header badge's rounded form: whole shekels, no agorot.
 *
 * Rounds half-up on the integer rather than truncating, so a cart of ₪99.60
 * reads ₪100 and not ₪99.
 */
export function shekelsRounded(value: Agorot): string {
  if (value <= 0) return '₪0'
  const whole = Math.floor((value + AGOROT_PER_ILS / 2) / AGOROT_PER_ILS)
  return `₪${whole.toLocaleString('he-IL', { useGrouping: true })}`
}
