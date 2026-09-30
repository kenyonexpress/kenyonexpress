import { type ReorderCard, pickReorderCard } from '@/lib/checkout/reorder'
import { getCart } from '@/server/actions/cart'
import { getMyPaymentTokens } from '@/server/queries/account'

/**
 * What the account's order pages need to offer one-click reorder: the card
 * the click would charge (null when there is none to offer) and how many
 * lines the click would replace in the current cart.
 *
 * Per customer, not per order, so the list page computes it once. The card is
 * chosen by the same rule the action applies at click time; the two can only
 * disagree if a card is deleted or expires between render and click, and the
 * action re-reads, so the click is still honest.
 *
 * The tokens come through the RLS client (the customer reads their own rows),
 * and a failed read there throws to the page like every other account query.
 */
export interface ReorderOffer {
  card: ReorderCard | null
  cartItemCount: number
}

export async function getReorderOffer(now: Date = new Date()): Promise<ReorderOffer> {
  const [tokens, cart] = await Promise.all([getMyPaymentTokens(), getCart()])
  return {
    card: pickReorderCard(tokens, now),
    cartItemCount: cart.item_count,
  }
}
