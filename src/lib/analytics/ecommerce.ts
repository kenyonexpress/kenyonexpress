/**
 * The commerce events GA4 and Meta both want, built once from one shape.
 *
 * WHY ONE BUILDER AND NOT TWO SDK CALLS AT EACH SITE. The two vendors disagree
 * about almost everything - GA4 wants `items[].item_id`, Meta wants
 * `contents[].id`; GA4 says `value`, Meta says `value` but with `currency` in a
 * different place; GA4's event is `purchase`, Meta's is `Purchase`. Calling
 * both by hand at every call site is how the two dashboards come to report
 * different numbers for the same week, and nobody can say which is wrong.
 *
 * So a call site describes WHAT HAPPENED, once, in this repo's own terms, and
 * the two payloads are derived from it.
 *
 * MONEY ARRIVES IN AGOROT AND IS CONVERTED EXACTLY ONCE, HERE. Both vendors
 * take a decimal in the account currency, so the boundary has to divide by 100
 * somewhere; doing it in the builder means no call site can pass a float around
 * and no rounding happens twice. `src/lib/money.ts` owns everything upstream of
 * this line.
 *
 * `redeem_coupon` IS A CUSTOM EVENT AND IS SENT TO GA4 ONLY. It is not a
 * purchase - the money moved weeks earlier - and reporting it to Meta as one
 * would double-count revenue in the ad platform that optimises spend against
 * it. That is the expensive kind of wrong.
 */

export interface CommerceItem {
  id: string
  name: string
  /** Integer agorot. Never a float, never shekels. */
  priceAgorot: number
  quantity: number
  category?: string | null
  supplier?: string | null
}

export interface CommerceEventInput {
  items: readonly CommerceItem[]
  /** Integer agorot. The amount that actually moved, not the list price. */
  valueAgorot: number
  /** Order id for purchase, so both vendors can deduplicate. */
  transactionId?: string
  coupon?: string | null
}

export const CURRENCY = 'ILS'

/** Agorot to the decimal both vendors expect. The only division in this path. */
export function toCurrencyAmount(agorot: number): number {
  if (!Number.isFinite(agorot)) return 0
  // Rounded to whole agorot first: a fractional agora is a bug upstream, and
  // passing it on would put 12.345 in a revenue report.
  return Math.round(agorot) / 100
}

export type GaEventName =
  | 'view_item'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'redeem_coupon'

export interface GaPayload {
  currency: string
  value: number
  transaction_id?: string
  coupon?: string
  items: {
    item_id: string
    item_name: string
    price: number
    quantity: number
    item_category?: string
    item_brand?: string
  }[]
}

export function buildGaPayload(input: CommerceEventInput): GaPayload {
  return {
    currency: CURRENCY,
    value: toCurrencyAmount(input.valueAgorot),
    ...(input.transactionId ? { transaction_id: input.transactionId } : {}),
    ...(input.coupon ? { coupon: input.coupon } : {}),
    items: input.items.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      price: toCurrencyAmount(item.priceAgorot),
      quantity: item.quantity,
      ...(item.category ? { item_category: item.category } : {}),
      // The supplier is the closest thing this catalogue has to a brand, and
      // leaving `item_brand` empty makes GA4's brand reports useless.
      ...(item.supplier ? { item_brand: item.supplier } : {}),
    })),
  }
}

export type MetaEventName = 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'

export interface MetaPayload {
  currency: string
  value: number
  content_type: 'product'
  content_ids: string[]
  contents: { id: string; quantity: number; item_price: number }[]
  num_items: number
}

export function buildMetaPayload(input: CommerceEventInput): MetaPayload {
  return {
    currency: CURRENCY,
    value: toCurrencyAmount(input.valueAgorot),
    // Required by Meta's catalogue matching. Without it every event is
    // unattributed and the dynamic-ads catalogue never links up.
    content_type: 'product',
    content_ids: input.items.map((item) => item.id),
    contents: input.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      item_price: toCurrencyAmount(item.priceAgorot),
    })),
    num_items: input.items.reduce((sum, item) => sum + item.quantity, 0),
  }
}

/**
 * Which Meta event, if any, corresponds to one of ours.
 *
 * `redeem_coupon` maps to nothing on purpose, and the null is load-bearing: a
 * redemption reported to Meta as a Purchase would double-count revenue in the
 * platform that decides how much to spend on ads.
 */
export function metaEventFor(name: GaEventName): MetaEventName | null {
  switch (name) {
    case 'view_item':
      return 'ViewContent'
    case 'add_to_cart':
      return 'AddToCart'
    case 'begin_checkout':
      return 'InitiateCheckout'
    case 'purchase':
      return 'Purchase'
    default:
      return null
  }
}
