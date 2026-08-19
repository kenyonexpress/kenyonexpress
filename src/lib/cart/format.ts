import { CART_LINE_MAX_QUANTITY, type CartViewItem } from '@/lib/cart/types'
import type { Agorot } from '@/lib/money'

const AGOROT_PER_ILS = 100

/**
 * Renders an integer agorot amount as `₪1,234.56`.
 *
 * Built by integer division rather than by `agorotToIls`, so no money value is
 * ever a float even for the length of a format call: the whole shekels and the
 * agorot remainder are separated with `/` and `%` on the integer, and only the
 * already-whole shekel part is handed to Intl for thousands grouping. That
 * keeps the one rule this cart is built on ("integer agorot, end to end") true
 * of the display layer as well, and not merely of the arithmetic behind it.
 *
 * The glyph is written literally instead of using `Intl.NumberFormat`'s ILS
 * currency style, which emits directional marks around the sign. Inside an RTL
 * document those marks reorder a price sitting next to Hebrew text, and the
 * live site this page is measured against prints the bare glyph.
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

/**
 * What to tell the shopper about a line that cannot be ordered.
 *
 * Every one of these used to be the single sentence "המוצר אינו זמין — הסירו
 * מהעגלה לפני התשלום", which is only true advice for two of the four. A line
 * that is merely short of stock does not need removing at all: lowering the
 * quantity fixes it, and the stepper now stops at the number named here.
 *
 * It lives beside `shekels` rather than in `CartLineItem.tsx`, which is the
 * component that renders it, because that file imports `useCart` and so reaches
 * `@/server/actions/cart` and its `server-only` marker: a test importing the
 * component to check one sentence fails to transform at all. This is a pure
 * function of a view item and has no business needing a provider.
 *
 * `unpriced` deliberately does not explain itself. It means an admin has not
 * set `platform_percent`, or a coupon price, on a product that is otherwise on
 * sale -- an internal configuration gap the shopper can neither cause nor cure,
 * and naming it would only be a confession with no action attached.
 */
export function unavailableMessage(item: CartViewItem): string | null {
  switch (item.unavailable_reason) {
    case 'delisted':
      return 'המוצר כבר לא נמכר — הסירו מהעגלה כדי להמשיך'
    case 'out_of_stock':
      return 'המוצר אזל מהמלאי — הסירו מהעגלה כדי להמשיך'
    case 'insufficient_stock':
      return item.max_quantity === null
        ? 'המוצר אינו זמין בכמות המבוקשת'
        : `נותרו ${item.max_quantity} במלאי — הפחיתו את הכמות כדי להמשיך`
    case 'unpriced':
      return 'המוצר אינו זמין להזמנה כרגע — הסירו מהעגלה כדי להמשיך'
    default:
      return null
  }
}

/**
 * The largest quantity the stepper on a line may reach.
 *
 * The shelf when the catalogue tracks one, the schema's hard cap otherwise, and
 * never above the cap. Shared by the cart page and the drawer because they both
 * used to write a bare `99`, so the drawer -- which is the FIRST cart a shopper
 * sees, since it opens on add-to-cart -- would happily run a line to 99 against
 * three in stock while the page beside it stopped at three.
 *
 * A ceiling on the input only. `validateProductForCart` re-reads stock on every
 * write, because this number is as old as the last cart render.
 */
export function lineQuantityCeiling(item: CartViewItem): number {
  return Math.min(CART_LINE_MAX_QUANTITY, item.max_quantity ?? CART_LINE_MAX_QUANTITY)
}
