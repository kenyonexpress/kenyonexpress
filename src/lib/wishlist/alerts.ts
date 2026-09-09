import type { Agorot } from '@/lib/commerce/money'

/**
 * When a saved product is worth mailing somebody about.
 *
 * WHAT A WISHLIST IS FOR, AND WHAT IT DID
 *
 * 154 shipped the table; SECTIONS 24 shipped the heart, the guest list, the
 * merge on login and the move-to-cart. None of it TELLS anybody anything. A
 * saved product that gets cheaper, or comes back into stock, is the entire
 * reason a shopper saved it — and the shop knew both facts and said nothing.
 *
 * Pure: no database, no clock. Both alerts are decisions about numbers, and the
 * numbers come from `price_history` (193) and `stock_waitlist` (195).
 */

/**
 * The smallest drop worth an email, in basis points of the saved price.
 *
 * 500 bp = 5%. Chosen against the direction of the mistake rather than from
 * data, because there is none: `wishlists` holds 0 rows. Too low and the
 * customer is mailed about ₪1 off a ₪200 cabin, learns the alert is noise, and
 * stops reading the ones that matter. Too high and a genuine sale goes unsaid.
 * Five percent is the smallest drop a shopper would describe as "it went down".
 */
export const PRICE_DROP_MIN_BP = 500

/**
 * And the smallest in absolute terms, because a percentage alone is wrong at
 * the bottom of the catalogue. 5% of a ₪9 massage is 45 agorot, and "the price
 * dropped!" about 45 agorot is the mail that teaches somebody to ignore us.
 */
export const PRICE_DROP_MIN_AGOROT = 500

export type PriceDropVerdict =
  | { alert: false; reason: 'no_history' | 'not_cheaper' | 'too_small' }
  | { alert: true; savedAgorot: Agorot; nowAgorot: Agorot; dropAgorot: number; dropBp: number }

export interface PriceDropInput {
  /** What the product cost on the day it was saved. Null when unrecorded. */
  savedAtAgorot: Agorot | null
  /** What it costs today. */
  nowAgorot: Agorot
}

/**
 * Should this saved product produce a price-drop alert?
 *
 * COMPARED AGAINST THE PRICE ON THE DAY IT WAS SAVED, not against yesterday.
 * "It is cheaper than when you saved it" is the sentence the customer can act
 * on; "it is cheaper than yesterday" is a sentence about a price they never
 * saw. It also makes the alert stable: a product that drifts down over three
 * weeks produces one useful mail rather than fifteen tiny ones.
 *
 * A saved price of null is `no_history`, NOT a fallback to some other baseline.
 * `price_history` starts the day 193 is applied, so every product saved before
 * that has no recorded price and there is nothing honest to compare with.
 */
export function priceDropVerdict(input: PriceDropInput): PriceDropVerdict {
  const { savedAtAgorot, nowAgorot } = input
  if (savedAtAgorot === null || savedAtAgorot <= 0) return { alert: false, reason: 'no_history' }
  if (nowAgorot >= savedAtAgorot) return { alert: false, reason: 'not_cheaper' }

  const dropAgorot = savedAtAgorot - nowAgorot
  // Integer arithmetic throughout: basis points of the saved price, floored, so
  // a drop that rounds up to the threshold does not sneak past it.
  const dropBp = Math.floor((dropAgorot * 10_000) / savedAtAgorot)

  // BOTH bounds, not either. A percentage alone is wrong at the bottom of the
  // catalogue and an absolute alone is wrong at the top: ₪5 off a ₪1,600
  // campaign is not news.
  if (dropBp < PRICE_DROP_MIN_BP || dropAgorot < PRICE_DROP_MIN_AGOROT) {
    return { alert: false, reason: 'too_small' }
  }

  return { alert: true, savedAgorot: savedAtAgorot, nowAgorot, dropAgorot, dropBp }
}

/**
 * The dedupe key for a price-drop mail.
 *
 * KEYED ON THE NEW PRICE, not on the day. A product that sits at the lower
 * price for a month must produce ONE mail, not thirty — so the key cannot carry
 * a date. And a product that drops again must produce a second mail, so the key
 * cannot be just the pair.
 *
 * The consequence, stated because it is a real one: a price that drops, returns
 * and drops again to the SAME figure will not mail twice. That is the right
 * trade — the second mail would say exactly what the first said, and the
 * customer has already been told.
 */
export function priceDropDedupeKey(userId: string, productId: string, nowAgorot: number): string {
  return `price_drop:${userId}:${productId}:${nowAgorot}`
}

/**
 * The dedupe key for a back-in-stock mail.
 *
 * Keyed on the waitlist ROW, not on the product: `stock_waitlist` already
 * enforces one live request per address per product, and a row is marked
 * `notified_at` when it is mailed. Keying on the row means a person who asks
 * again after a later restock gets told again, which is what asking again
 * means.
 */
export function backInStockDedupeKey(waitlistId: string): string {
  return `back_in_stock:${waitlistId}`
}
