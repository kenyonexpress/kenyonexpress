import { type Agorot, agorot } from '@/lib/money'
import {
  type CarrierId,
  carrierEntry,
  carrierService,
  isCarrierId,
} from '@/lib/shipping/carrier-registry'
import { deliveryLabel } from '@/lib/shipping/estimate'
import type { CarrierQuote } from '@/lib/shipping/providers/types'
import { type ZoneId, type ZonePolicy, shopperShippingAgorot } from '@/lib/shipping/zones'

/**
 * The shipping options a shopper sees at checkout, folded from two sources:
 * the carriers' quotes (what the courier bills us) and the zone policy (what
 * the shopper is charged). Pure.
 *
 * WHY THE SHOPPER PRICE IS NOT THE CARRIER PRICE. The site prints "משלוח
 * מהיר חינם" on every page and `shipping_zones` is seeded free everywhere.
 * Passing a courier's ₪34 through to the shopper would contradict the banner
 * and change a business decision from inside a code change. So the carrier
 * cost is kept, on the shipment row and in the admin's view, and the shopper
 * line is the zone's rate: zero today, a flat rate the day the table says so.
 *
 * The carrier choice still matters at zero: it decides who collects the
 * parcel and how fast it travels, and the picked option is what the label is
 * created with.
 */

export interface ShippingOption {
  /** `<carrierId>:<serviceCode>`; the radio value and the stored choice. */
  id: string
  carrierId: CarrierId
  serviceCode: string
  carrierLabel: string
  serviceLabel: string
  /** "2-5 ימי עסקים" */
  etaLabel: string
  minDays: number
  maxDays: number
  /** Charged to the shopper on the card, agorot. */
  shopperAgorot: Agorot
  /** Billed to the platform by the courier, agorot; shown to admins only. */
  carrierCostAgorot: Agorot
  quoteRef: string | null
}

export function shippingOptionId(carrierId: CarrierId, serviceCode: string): string {
  return `${carrierId}:${serviceCode}`
}

export function parseShippingOptionId(
  value: unknown,
): { carrierId: string; serviceCode: string } | null {
  if (typeof value !== 'string') return null
  const idx = value.indexOf(':')
  if (idx <= 0 || idx === value.length - 1) return null
  return { carrierId: value.slice(0, idx), serviceCode: value.slice(idx + 1) }
}

export function buildShippingOptions(input: {
  quotes: readonly CarrierQuote[]
  zone: ZoneId | null
  policy: ZonePolicy
  subtotalAgorot: Agorot
}): ShippingOption[] {
  if (!input.policy.deliverable) return []
  const shopperAgorot = shopperShippingAgorot(input.policy, input.subtotalAgorot)
  const options = input.quotes.map((q): ShippingOption => {
    const entry = carrierEntry(q.carrierId)
    const service = carrierService(q.carrierId, q.serviceCode)
    return {
      id: shippingOptionId(q.carrierId, q.serviceCode),
      carrierId: q.carrierId,
      serviceCode: q.serviceCode,
      carrierLabel: entry.label,
      serviceLabel: service.label,
      etaLabel: deliveryLabel(q.minDays, q.maxDays),
      minDays: q.minDays,
      maxDays: q.maxDays,
      shopperAgorot,
      carrierCostAgorot: q.carrierCostAgorot,
      quoteRef: q.quoteRef,
    }
  })
  // Cheapest for the platform first, then fastest, then a stable name order so
  // two renders of the same quotes agree.
  return options.sort(
    (a, b) =>
      a.carrierCostAgorot - b.carrierCostAgorot ||
      a.maxDays - b.maxDays ||
      a.id.localeCompare(b.id),
  )
}

/**
 * Parcel weight for a quote, grams. `products.weight_grams` is in the hosted
 * schema and NULL on every row today, so a line without a weight counts as
 * one kilogram per unit: heavy enough to be quoted honestly by every carrier,
 * light enough not to refuse a book. Minimum 100g, because a zero-weight
 * parcel is rejected by every courier's validator.
 */
export const DEFAULT_UNIT_WEIGHT_GRAMS = 1000

export function estimateParcelWeightGrams(
  lines: readonly { quantity: number; weightGrams: number | null }[],
): number {
  let total = 0
  for (const line of lines) {
    const unit =
      line.weightGrams !== null && Number.isFinite(line.weightGrams) && line.weightGrams > 0
        ? Math.round(line.weightGrams)
        : DEFAULT_UNIT_WEIGHT_GRAMS
    total += unit * Math.max(0, Math.trunc(line.quantity))
  }
  return Math.max(100, total)
}

/** The declared value for the carrier: what the shopper paid for the physical lines, agorot. */
export function declaredValueAgorot(lineTotals: readonly Agorot[]): Agorot {
  return agorot(lineTotals.reduce<number>((sum, v) => sum + v, 0))
}

export interface ShippingChoice {
  carrierId: CarrierId
  serviceCode: string
  carrierLabel: string
  serviceLabel: string
}

/**
 * The shopper's posted option resolved against the registry, or null for
 * anything the registry does not know. Null is "no preference", never an
 * error: the radio only offers registry ids, so an unknown one is a stale
 * tab or a hand-made request, and either costs the shopper nothing.
 */
export function resolveShippingChoice(value: unknown): ShippingChoice | null {
  const parsed = parseShippingOptionId(value)
  if (!parsed || !isCarrierId(parsed.carrierId)) return null
  const entry = carrierEntry(parsed.carrierId)
  const service = entry.services.find((s) => s.code === parsed.serviceCode)
  if (!service) return null
  return {
    carrierId: parsed.carrierId,
    serviceCode: service.code,
    carrierLabel: entry.label,
    serviceLabel: service.label,
  }
}

/** The line written into the order notes so the supplier and the admin read the pick with the order. */
export function shippingCarrierNoteLine(choice: ShippingChoice): string {
  return `חברת משלוחים מבוקשת: ${choice.carrierLabel} (${choice.serviceLabel})`
}
