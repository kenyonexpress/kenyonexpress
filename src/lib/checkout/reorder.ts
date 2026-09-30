import { isCardTokenExpired } from '@/lib/payments/token-expiry'

/**
 * One-click reorder: the pure half.
 *
 * A returning customer with a saved card should be able to buy a past order
 * again without typing anything: no card form, no address form, no cart page.
 * The action that does it (server/actions/payments/reorder.ts) rebuilds the
 * cart from the order's lines and hands the result to the ordinary
 * `beginCheckout` with the saved token, which charges it server-to-server and
 * falls back to the hosted page when the issuer insists on a 3DS challenge.
 *
 * Everything that can be decided without a database lives here, so the two
 * decisions the shopper never sees (which card, which lines) are tested on
 * their own and the action tests can stay about wiring.
 */

/** The maximum quantity a single cart line may hold; `addToCart` clamps to it. */
export const REORDER_MAX_LINE_QUANTITY = 99

export interface ReorderCardCandidate {
  id: string
  last4: string | null
  cardBrand: string | null
  expiryMonth: number | null
  expiryYear: number | null
  isDefault: boolean
  createdAt: string
}

export interface ReorderCard {
  id: string
  last4: string | null
  cardBrand: string | null
}

/**
 * Which saved card a one-click reorder charges.
 *
 * The default card wins when it is still in date. Otherwise the newest card
 * that is: a shopper whose default expired last month still has a live card on
 * file, and refusing the one-click button over the stale default would send
 * them through the full checkout for nothing. An expired card is never picked,
 * for the same reason the checkout page hides it: it buys a guaranteed decline.
 *
 * Null means "no card to charge", and the button degrades to a plain reorder
 * that rebuilds the cart and opens the checkout.
 */
export function pickReorderCard(
  candidates: readonly ReorderCardCandidate[],
  now: Date,
): ReorderCard | null {
  const live = candidates.filter(
    (card) => !isCardTokenExpired(card.expiryMonth, card.expiryYear, now),
  )
  if (live.length === 0) return null
  const chosen =
    live.find((card) => card.isDefault) ??
    [...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!chosen) return null
  return { id: chosen.id, last4: chosen.last4, cardBrand: chosen.cardBrand }
}

export interface ReorderSourceLine {
  product_id: string | null
  variant_id: string | null
  quantity: number | null
}

export interface ReorderPlannedLine {
  productId: string
  variantId: string | null
  quantity: number
}

export interface ReorderPlan {
  lines: ReorderPlannedLine[]
  /** Lines whose product row is gone (product_id null): nothing to add. */
  droppedWithoutProduct: number
}

/**
 * The cart lines a past order turns back into.
 *
 * Lines are merged by product and variant, because two order lines for the
 * same product (a rare shape the order snapshot allows) are one cart line.
 * Quantities are clamped to the cart's own ceiling rather than refused: a
 * bulk order of 120 becomes 99, which is what the cart would have done had
 * the shopper typed it. Non-positive and non-integer quantities read as 1,
 * since the line existed and was paid for once.
 *
 * A line without a product id is dropped and counted, not failed: the product
 * was deleted after the sale, and the rest of the order is still buyable.
 */
export function planReorderLines(source: readonly ReorderSourceLine[]): ReorderPlan {
  const merged = new Map<string, ReorderPlannedLine>()
  let droppedWithoutProduct = 0
  for (const line of source) {
    if (!line.product_id) {
      droppedWithoutProduct += 1
      continue
    }
    const quantity =
      Number.isInteger(line.quantity) && (line.quantity as number) > 0
        ? (line.quantity as number)
        : 1
    const key = `${line.product_id}:${line.variant_id ?? ''}`
    const existing = merged.get(key)
    const total = (existing?.quantity ?? 0) + quantity
    merged.set(key, {
      productId: line.product_id,
      variantId: line.variant_id ?? null,
      quantity: Math.min(REORDER_MAX_LINE_QUANTITY, total),
    })
  }
  return { lines: [...merged.values()], droppedWithoutProduct }
}

/**
 * The line under the one-click button: which card, and what happens to the
 * cart the shopper already has. Built here so the server page and the client
 * button agree on the wording, and so it is testable without rendering.
 */
export function describeReorderCard(card: ReorderCard): string {
  const brand = card.cardBrand ? `${card.cardBrand} ` : ''
  const digits = card.last4 ? `•••• ${card.last4}` : 'השמור'
  return `החיוב יבוצע בכרטיס ${brand}${digits}`.replace(/\s+/g, ' ').trim()
}

export function describeCartReplacement(cartItemCount: number): string | null {
  if (!Number.isInteger(cartItemCount) || cartItemCount <= 0) return null
  return cartItemCount === 1
    ? 'הפריט שבעגלה כעת יוחלף בפריטי ההזמנה'
    : `${cartItemCount} הפריטים שבעגלה כעת יוחלפו בפריטי ההזמנה`
}

/** What a rebuild that skipped lines tells the shopper. */
export function describeSkippedLines(names: readonly string[]): string | null {
  if (names.length === 0) return null
  const shown = names.slice(0, 3).join(', ')
  const more = names.length > 3 ? ` ועוד ${names.length - 3}` : ''
  return `לא ניתן היה להוסיף: ${shown}${more}`
}
