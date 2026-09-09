/**
 * Israeli carrier registry: canonical Hebrew label + tracking link per
 * carrier, resolved from the free-text `carrier` field on `order_items`.
 *
 * The field is free text on purpose (the admin types whatever the supplier
 * told them), so resolution is alias-based and forgiving about case, spacing
 * and punctuation. An unrecognised carrier still renders: the raw text is the
 * label and there is simply no link. A wrong guess would send the customer to
 * the wrong courier's site, which is worse than no link at all.
 *
 * Deep links (number embedded in the URL) are used only where the query
 * format is stable and public (Israel Post, UPS, FedEx, DHL). Local couriers
 * that rotate their tracking pages get a link to the tracking page itself and
 * the customer pastes the number; a stale deep link is a dead end, a tracking
 * page is not.
 */

export interface ResolvedCarrier {
  /** Canonical Hebrew display name, or the raw input when unrecognised. */
  label: string
  /** Where the customer can track the parcel, or null when unrecognised. */
  url: string | null
}

interface CarrierEntry {
  label: string
  aliases: string[]
  /** Deep link taking the tracking number, or a plain tracking-page URL. */
  url: (trackingNumber: string) => string
}

/** Lowercase and strip everything that is not a Hebrew/Latin letter or digit. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9֐-׿]/g, '')
}

const CARRIERS: CarrierEntry[] = [
  {
    label: 'דואר ישראל',
    aliases: ['דואר ישראל', 'דואר', 'israel post', 'israelpost', 'doar', 'דואר רשום', 'ems'],
    url: (tn) => `https://israelpost.co.il/itemtrace/?itemcode=${encodeURIComponent(tn)}`,
  },
  {
    label: 'UPS',
    aliases: ['ups', 'יו פי אס'],
    url: (tn) => `https://www.ups.com/track?loc=he_IL&tracknum=${encodeURIComponent(tn)}`,
  },
  {
    label: 'FedEx',
    aliases: ['fedex', 'פדקס'],
    url: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`,
  },
  {
    label: 'DHL',
    aliases: ['dhl', 'די אייץ אל'],
    url: (tn) =>
      `https://www.dhl.com/il-he/home/tracking.html?tracking-id=${encodeURIComponent(tn)}`,
  },
  {
    label: 'HFD',
    aliases: ['hfd', 'אייץ אף די', 'חברת hfd'],
    url: () => 'https://hfd.co.il/tracking/',
  },
  {
    label: "צ'יטה שליחויות",
    aliases: ['chita', 'cheetah', "צ'יטה", 'ציטה', 'צייטה'],
    url: () => 'https://chita.co.il/tracking',
  },
  {
    label: 'תמנון שליחויות',
    aliases: ['tamnun', 'תמנון'],
    url: () => 'https://tamnun.co.il/tracking/',
  },
  {
    label: 'בלדר',
    aliases: ['baldar', 'בלדר'],
    url: () => 'https://baldar.co.il/',
  },
  {
    label: 'קרגו',
    aliases: ['cargo', 'קרגו', 'cargo express'],
    url: () => 'https://cargo.co.il/',
  },
]

const ALIAS_INDEX = new Map<string, CarrierEntry>()
for (const entry of CARRIERS) {
  for (const alias of entry.aliases) ALIAS_INDEX.set(normalize(alias), entry)
}

/**
 * Resolve a free-text carrier and a tracking number into what the customer
 * sees. Null carrier means no label at all; a recognised carrier without a
 * tracking number keeps the label but drops deep links that would 404.
 */
export function resolveCarrier(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): ResolvedCarrier | null {
  const raw = carrier?.trim()
  if (!raw) return null
  const entry = ALIAS_INDEX.get(normalize(raw))
  if (!entry) return { label: raw, url: null }
  const tn = trackingNumber?.trim()
  if (!tn) return { label: entry.label, url: null }
  return { label: entry.label, url: entry.url(tn) }
}

/** Convenience for call sites that only want the link. */
export function carrierTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  return resolveCarrier(carrier, trackingNumber)?.url ?? null
}
