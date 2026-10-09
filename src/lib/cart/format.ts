import { CART_LINE_MAX_QUANTITY, type CartViewItem } from '@/lib/cart/types'

/**
 * `shekels` and `shekelsRounded` moved to `@/lib/money-format`.
 *
 * They were never cart-specific -- `CheckoutForm` already imported them from
 * here, through a path that says "cart" -- and there were five other private
 * copies of the same idea across the app, three of which took shekels rather
 * than agorot under the same name. One formatter, one unit, one place.
 *
 * What stays here is what is genuinely about a cart line.
 */
export { shekels, shekelsRounded } from '@/lib/money-format'

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
    case 'price_error':
      // Deliberately the same sentence as `unpriced`, and for the same reason:
      // the shopper can neither cause nor cure it, and the honest version --
      // "the price on this is wrong" -- reads as an invitation to try again
      // later on a discount that was never real.
      return 'המוצר אינו זמין להזמנה כרגע — הסירו מהעגלה כדי להמשיך'
    case 'unpriced':
      return 'המוצר אינו זמין להזמנה כרגע — הסירו מהעגלה כדי להמשיך'
    default:
      return null
  }
}

/**
 * The largest quantity a stepper may reach, from a raw stock level.
 *
 * The shelf when the catalogue tracks one, the schema's hard cap otherwise, and
 * never above the cap. Zero and negatives mean "nothing to sell", which the buy
 * row handles by disabling itself; they fall back to the cap here rather than
 * producing a `max="0"` on a `min="1"` input, which is a contradiction the
 * browser resolves by ignoring one of the two.
 *
 * MEASURED on a built server before this existed: /product/demo-coupon-1
 * rendered `max="100"` - the product page wrote `stock > 0 ? stock : 99` and
 * handed the raw shelf count to the input. `CART_LINE_MAX_QUANTITY` is named
 * precisely to stop that, and its own comment says why: a stepper that goes to
 * 100 against a schema that stops at 99 is a button whose only outcome is a
 * validation toast.
 */
export function productQuantityCeiling(stock: number | null | undefined): number {
  if (typeof stock !== 'number' || !Number.isFinite(stock) || stock <= 0) {
    return CART_LINE_MAX_QUANTITY
  }
  return Math.min(CART_LINE_MAX_QUANTITY, Math.floor(stock))
}

/**
 * The ceiling for a line already in the cart.
 *
 * Shared by the cart page and the drawer because they both used to write a bare
 * `99`, so the drawer -- which is the FIRST cart a shopper sees, since it opens
 * on add-to-cart -- would happily run a line to 99 against three in stock while
 * the page beside it stopped at three. The product page was the third surface
 * and was left out of that unification; it shares the CAP, through
 * `productQuantityCeiling` above, and not this function.
 *
 * NOT written as `productQuantityCeiling(item.max_quantity)`, because the two
 * disagree about zero and must. On a line already in the cart, 0 means the
 * shelf emptied underneath it, and a ceiling of 0 is exactly what keeps `+`
 * disabled on a line the shopper has to reduce or remove. On the product page
 * that same 0 disables the whole buy row, so passing it through to `max` would
 * only put a `max="0"` on a `min="1"` input.
 *
 * A ceiling on the input only. `validateProductForCart` re-reads stock on every
 * write, because this number is as old as the last cart render.
 */
export function lineQuantityCeiling(item: CartViewItem): number {
  return Math.min(CART_LINE_MAX_QUANTITY, item.max_quantity ?? CART_LINE_MAX_QUANTITY)
}
