/**
 * The API carriers: the three Israeli couriers this platform can quote, label
 * and track through a provider adapter (lib/shipping/providers/*).
 *
 * This is a DIFFERENT list from `carriers.ts` next door, on purpose. That one
 * resolves free text an admin typed into a Hebrew label and a tracking link,
 * and it is forgiving because the field is free text. This one is closed: an
 * id here is a provider the server can call, with credentials of its own and
 * a service menu of its own, and the checkout radio, the orders column and
 * the shipments rows all carry one of these ids and nothing else.
 *
 * WHAT THE SHOPPER PAYS IS NOT DECIDED HERE. A carrier's quote is what the
 * platform pays the courier; what the shopper is charged is the zone policy
 * in `shipping_zones` (197, live, free everywhere as of 2026-10-08) folded in
 * by `quote.ts`. The sitewide banner says "משלוח מהיר חינם" and this file is
 * not the place to contradict a sentence printed on every page.
 */

export type CarrierId = 'israel_post' | 'chita' | 'yamit'

export interface CarrierService {
  /** The provider's own service code, sent on the wire as-is. */
  code: string
  /** Hebrew label the radio renders. */
  label: string
  /** Business days, inclusive band; the carrier's published promise. */
  minDays: number
  maxDays: number
}

export interface CarrierEntry {
  id: CarrierId
  /** Hebrew display name, identical to the label `carriers.ts` resolves to. */
  label: string
  /** The free-text alias written to `order_items.carrier`, so `resolveCarrier` links it. */
  legacyCarrierText: string
  /** Services offered, the default first. */
  services: readonly CarrierService[]
  /** Env prefix: `<PREFIX>_API_BASE_URL`, `<PREFIX>_API_KEY`, `<PREFIX>_ACCOUNT_ID`. */
  envPrefix: string
  /** Public tracking page, for the customer; the deep link lives in carriers.ts. */
  trackingPageUrl: string
  /** Largest parcel the carrier takes, grams. */
  maxWeightGrams: number
}

export const CARRIER_IDS: readonly CarrierId[] = ['israel_post', 'chita', 'yamit']

export const CARRIER_REGISTRY: Record<CarrierId, CarrierEntry> = {
  israel_post: {
    id: 'israel_post',
    label: 'דואר ישראל',
    legacyCarrierText: 'דואר ישראל',
    services: [
      { code: 'registered', label: 'דואר רשום עד הבית', minDays: 3, maxDays: 7 },
      { code: 'ems', label: 'EMS מהיר', minDays: 1, maxDays: 3 },
      { code: 'locker', label: 'איסוף מלוקר דואר', minDays: 3, maxDays: 6 },
    ],
    envPrefix: 'ISRAEL_POST',
    trackingPageUrl: 'https://israelpost.co.il/itemtrace/',
    maxWeightGrams: 20_000,
  },
  chita: {
    id: 'chita',
    label: "צ'יטה שליחויות",
    legacyCarrierText: "צ'יטה",
    services: [
      { code: 'standard', label: 'שליח עד הבית', minDays: 2, maxDays: 5 },
      { code: 'express', label: 'שליח מהיר, עד יום עסקים', minDays: 1, maxDays: 1 },
    ],
    envPrefix: 'CHITA',
    trackingPageUrl: 'https://chita.co.il/tracking',
    maxWeightGrams: 30_000,
  },
  yamit: {
    id: 'yamit',
    label: 'ימית שליחויות',
    legacyCarrierText: 'ימית',
    services: [
      { code: 'standard', label: 'שליח עד הבית', minDays: 2, maxDays: 4 },
      { code: 'pickup_point', label: 'נקודת איסוף', minDays: 2, maxDays: 5 },
    ],
    envPrefix: 'YAMIT',
    trackingPageUrl: 'https://yamit-dm.co.il/tracking',
    maxWeightGrams: 30_000,
  },
}

export function isCarrierId(value: unknown): value is CarrierId {
  return typeof value === 'string' && (CARRIER_IDS as readonly string[]).includes(value)
}

export function carrierEntry(id: CarrierId): CarrierEntry {
  return CARRIER_REGISTRY[id]
}

/**
 * The service a stored code names on a carrier, or the carrier's default.
 * Falling back is deliberate: a renamed service must cost a re-quote, not a
 * label the admin cannot print.
 */
export function carrierService(id: CarrierId, code: string | null | undefined): CarrierService {
  const entry = CARRIER_REGISTRY[id]
  const found = code ? entry.services.find((s) => s.code === code) : undefined
  const service = found ?? entry.services[0]
  if (!service) throw new Error(`carrier ${id} has no services`)
  return service
}

/**
 * The value `order_items.carrier` receives when a label is created through a
 * provider: the alias `carriers.ts` already resolves, so the account page,
 * the shipped email and the SMS keep linking exactly as they do for a label
 * typed by hand.
 */
export function legacyCarrierText(id: CarrierId): string {
  return CARRIER_REGISTRY[id].legacyCarrierText
}

/** A hand-typed or stored carrier text mapped back to a registry id, when it names one. */
export function carrierIdFromText(value: string | null | undefined): CarrierId | null {
  const raw = value?.trim()
  if (!raw) return null
  if (isCarrierId(raw)) return raw
  const norm = raw.toLowerCase().replace(/[^a-z0-9א-ת]/g, '')
  const aliases: Record<CarrierId, string[]> = {
    israel_post: ['דוארישראל', 'דואר', 'israelpost', 'doar', 'ems'],
    chita: ['ציטה', 'צייטה', 'ציטהשליחויות', 'chita', 'cheetah'],
    yamit: ['ימית', 'ימיתשליחויות', 'yamit', 'ydm'],
  }
  for (const id of CARRIER_IDS) {
    if (aliases[id].includes(norm)) return id
  }
  return null
}
