import { type Agorot, agorot, multiplyAgorot } from '@/lib/commerce/money'

/**
 * Bundle savings, as a pure function of the rules and the cart (STEP 60).
 *
 * A bundle is a set of (product, quantity) rows and one fixed amount in
 * agorot. When the cart holds every row in at least its quantity, the amount
 * comes off the on-site charge once per complete set. Nothing here reads a
 * table or a cookie: the cart pricer calls this with the rows the database
 * answered and the lines it has already priced, and the checkout calls it
 * again with a fresh read of both before the card is charged, so the number
 * the shopper saw and the number the card is reduced by are the same
 * function of the same inputs.
 *
 * THREE RULES THAT ARE NOT OBVIOUS
 *
 *   1. A unit of a product is consumed by ONE bundle. Two bundles that both
 *      name the same mug do not both take it: the bundle worth more is
 *      applied first and the units it used are gone for the next. Without
 *      this, an admin who defines "mug + plate" and "mug + bowl" would be
 *      giving two savings on one mug, which is not what either rule says.
 *   2. A saving can never exceed what the consumed units cost on site. A
 *      bundle of two ₪10 items with a ₪30 saving is an admin mistake, and the
 *      cart refuses to pay the shopper for taking them rather than charging
 *      a negative line. The commission ceiling (settlement.ts) is applied by
 *      the caller on the total; this one is per bundle and about the goods.
 *   3. Quantity is counted per PRODUCT, across variants. "Two t-shirts" is
 *      satisfied by a small and a large, because that is what the admin who
 *      wrote "t-shirt × 2" meant.
 */

export type BundleItemRule = {
  product_id: string
  quantity: number
}

export type BundleDefinition = {
  id: string
  name_he: string
  /** Integer agorot off the on-site charge for one complete set. */
  discount_agorot: number
  starts_at: string | null
  expires_at: string | null
  items: BundleItemRule[]
}

/** One priced cart line, as the evaluator needs to see it. */
export type BundleCartLine = {
  product_id: string
  quantity: number
  /** What this line is charged on site, in agorot: the value a saving is capped at. */
  customer_pays_now: Agorot
}

export type AppliedBundle = {
  id: string
  name_he: string
  /** How many complete sets the cart holds. */
  times: number
  /** The saving for this bundle after the per-bundle cap, in agorot. */
  discount: Agorot
}

export type BundleEvaluation = {
  applied: AppliedBundle[]
  /** The sum of every applied bundle's `discount`, before the caller's caps. */
  total: Agorot
}

const ZERO = agorot(0)

/** Whether the bundle's window, if any, is open at `now`. */
export function isBundleOpen(
  bundle: Pick<BundleDefinition, 'starts_at' | 'expires_at'>,
  now: Date,
): boolean {
  const t = now.getTime()
  if (bundle.starts_at) {
    const start = new Date(bundle.starts_at).getTime()
    if (Number.isNaN(start) || start > t) return false
  }
  if (bundle.expires_at) {
    const end = new Date(bundle.expires_at).getTime()
    if (Number.isNaN(end) || end <= t) return false
  }
  return true
}

/**
 * The bundle's rows with duplicates merged and nonsense dropped. A rule with
 * no usable row never applies: an empty set is "complete" in every cart, and
 * applying a saving to every cart is not what an empty bundle means.
 */
function usableItems(bundle: BundleDefinition): BundleItemRule[] {
  const merged = new Map<string, number>()
  for (const item of bundle.items) {
    const quantity = Math.trunc(Number(item.quantity))
    if (!item.product_id || !Number.isFinite(quantity) || quantity < 1) continue
    merged.set(item.product_id, (merged.get(item.product_id) ?? 0) + quantity)
  }
  return [...merged].map(([product_id, quantity]) => ({ product_id, quantity }))
}

export function evaluateBundles(
  bundles: BundleDefinition[],
  lines: BundleCartLine[],
  now: Date = new Date(),
): BundleEvaluation {
  if (bundles.length === 0 || lines.length === 0) return { applied: [], total: ZERO }

  // Per product, across variants: how many units the cart holds and what
  // they cost on site. Both are what the per-bundle cap divides.
  const available = new Map<string, number>()
  const payable = new Map<string, number>()
  for (const line of lines) {
    const quantity = Math.trunc(Number(line.quantity))
    if (!Number.isFinite(quantity) || quantity < 1) continue
    available.set(line.product_id, (available.get(line.product_id) ?? 0) + quantity)
    payable.set(
      line.product_id,
      (payable.get(line.product_id) ?? 0) + Math.max(0, Math.trunc(line.customer_pays_now)),
    )
  }
  // The unit count the caps divide by never changes while units are consumed.
  const held = new Map(available)

  // Rule 1: worth-more first, id as the tie-break so the order is the same on
  // every render and at checkout.
  const ordered = bundles
    .filter((bundle) => Number.isInteger(bundle.discount_agorot) && bundle.discount_agorot > 0)
    .filter((bundle) => isBundleOpen(bundle, now))
    .slice()
    .sort((a, b) => b.discount_agorot - a.discount_agorot || a.id.localeCompare(b.id))

  const applied: AppliedBundle[] = []
  let total = 0

  for (const bundle of ordered) {
    const items = usableItems(bundle)
    if (items.length === 0) continue

    let times = Number.POSITIVE_INFINITY
    for (const item of items) {
      const left = available.get(item.product_id) ?? 0
      times = Math.min(times, Math.floor(left / item.quantity))
      if (times === 0) break
    }
    if (!Number.isFinite(times) || times < 1) continue

    // Rule 2: the value of exactly the units this bundle consumes.
    let consumedValue = 0
    for (const item of items) {
      const consumed = item.quantity * times
      const heldQty = held.get(item.product_id) ?? 0
      const heldValue = payable.get(item.product_id) ?? 0
      consumedValue += heldQty > 0 ? Math.floor((heldValue * consumed) / heldQty) : 0
      available.set(item.product_id, (available.get(item.product_id) ?? 0) - consumed)
    }

    const discount = Math.min(multiplyAgorot(agorot(bundle.discount_agorot), times), consumedValue)
    if (discount <= 0) continue

    applied.push({ id: bundle.id, name_he: bundle.name_he, times, discount: agorot(discount) })
    total += discount
  }

  return { applied, total: agorot(total) }
}
