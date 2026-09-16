import { type Agorot, agorot } from '@/lib/money'

/**
 * The shipping methods a shopper can pick in the cart, defined in code.
 *
 * WHY CODE AND NOT A TABLE. Production has no shipping table and no shipping
 * column on `orders`; the only fulfilment fact the database knows is
 * `products.requires_shipping`. A registry here is the same shape as
 * `carriers.ts` next door: a closed list the server validates a cookie value
 * against, so an edited cookie can name a different method and never a
 * different price.
 *
 * WHY EVERY RATE IS ZERO TODAY. Charging for shipping means a line on the card
 * charge that `orders` has nowhere to record: the money columns are resolved
 * per-database in `order-money-columns.ts` and none of them is a shipping
 * amount. `migrations/pending/236_orders_shipping_method.sql` adds the two
 * columns; until it is applied, `methods-cost-nothing.test.ts` pins every rate
 * at zero so the cart total and the settlement engine (which does not know
 * about shipping) cannot show two different numbers. The live site's own
 * rule, "נשלח ישירות על ידי הספק" with the price included, is what zero
 * describes.
 *
 * The selection itself still matters with a zero rate: it is what tells the
 * supplier whether to ship or to expect the customer at the door.
 */

export type ShippingMethodId = 'supplier_delivery' | 'pickup'

export type ShippingMethod = {
  id: ShippingMethodId
  /** Hebrew label the radio renders. */
  label: string
  /** One line under the label: who does it and how long it takes. */
  description: string
  /** Integer agorot added to the on-site charge. */
  costAgorot: Agorot
}

export const DEFAULT_SHIPPING_METHOD_ID: ShippingMethodId = 'supplier_delivery'

/**
 * Ordered as the radiogroup renders them: the default first, because a list
 * whose first option is not the pre-selected one reads as if nothing is
 * selected.
 */
export const SHIPPING_METHODS: readonly ShippingMethod[] = [
  {
    id: 'supplier_delivery',
    label: 'משלוח עד הבית',
    description: 'נשלח ישירות על ידי הספק, 3-7 ימי עסקים',
    costAgorot: agorot(0),
  },
  {
    id: 'pickup',
    label: 'איסוף עצמי מהספק',
    description: 'בתיאום עם הספק לאחר אישור ההזמנה',
    costAgorot: agorot(0),
  },
]

export function isShippingMethodId(value: unknown): value is ShippingMethodId {
  return typeof value === 'string' && SHIPPING_METHODS.some((method) => method.id === value)
}

/**
 * The method a stored value names, or the default when it names nothing.
 *
 * Falling back rather than failing is deliberate: the value comes from a
 * cookie, and a cookie that outlives a renamed method should cost the shopper
 * a re-selection, not a broken cart.
 */
export function resolveShippingMethod(value: unknown): ShippingMethod {
  const id = isShippingMethodId(value) ? value : DEFAULT_SHIPPING_METHOD_ID
  const method = SHIPPING_METHODS.find((entry) => entry.id === id)
  // The default is a member of the list by construction; the throw is for the
  // day someone edits the list and not the constant.
  if (!method) throw new Error(`shipping method registry has no default: ${id}`)
  return method
}
