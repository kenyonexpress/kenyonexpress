/**
 * Who carries the parcel, and where the customer can watch it.
 *
 * WHAT THIS FIXES, AND IT IS A CHAIN WITH ONE LINK MISSING
 *
 * 155 gave `order_items` a `carrier` and a `tracking_number` and both are
 * applied in production. The admin records them. `buildOrderShippedEmail` then
 * mails the customer "ההזמנה שלך נשלחה" with a button reading
 * "למעקב אחרי ההזמנה" that points at `/account/orders` — and that page renders
 * the words "· נשלח" and **nothing else**. No carrier, no number, no link.
 *
 * So the number is captured, stored, and shown to nobody. The email raises
 * exactly the question the page it links to cannot answer, and the customer's
 * only remaining move is to write to support for a string that is already in
 * the database.
 *
 * WHY A REGISTRY AND NOT A FREE-TEXT COLUMN
 *
 * `carrier` IS a free-text column and stays one: it is what the admin form
 * writes and re-typing history is not worth a migration. This maps whatever was
 * typed onto a known carrier so the customer gets a link, and falls back to
 * showing the typed string when it does not match. A closed enum in the column
 * would have made "HFD " with a trailing space an unshippable order.
 *
 * WHY SOME CARRIERS HAVE NO URL, DELIBERATELY
 *
 * A tracking link that goes to the wrong place is worse than no link, because
 * it looks like it worked: the customer follows it, sees "no such shipment",
 * and concludes the parcel is lost. The four URLs below are the ones whose form
 * is publicly documented and stable. The Israeli couriers under them —
 * HFD, צ'יטה, בלדר — are named so the customer knows WHO has the parcel, and
 * carry no URL because guessing one would produce exactly that failure. Adding
 * one is a two-line change once somebody has opened it and watched it work.
 */

export interface Carrier {
  /** Stable key. Matched case-insensitively against the typed `carrier`. */
  id: string
  /** What the customer is shown. */
  nameHe: string
  /**
   * Tracking URL with `{tracking}` where the number goes, or null when no
   * public form has been verified.
   */
  urlTemplate: string | null
  /** Spellings an operator might type. Lowercased, no punctuation. */
  aliases: readonly string[]
}

export const CARRIERS: readonly Carrier[] = [
  {
    id: 'israel_post',
    nameHe: 'דואר ישראל',
    urlTemplate: 'https://mypost.israelpost.co.il/itemtrace?itemcode={tracking}',
    aliases: ['israel post', 'israelpost', 'דואר ישראל', 'דואר', 'post'],
  },
  {
    id: 'hfd',
    nameHe: 'HFD',
    // No URL: HFD's public tracking form has not been verified from here, and
    // a link that 404s reads to the customer as a lost parcel.
    urlTemplate: null,
    aliases: ['hfd', 'אייץ אף די', 'אץ אף די'],
  },
  {
    id: 'cheetah',
    nameHe: 'צ׳יטה',
    urlTemplate: null,
    aliases: ['cheetah', 'chita', "צ'יטה", 'צ׳יטה', 'ציטה'],
  },
  {
    id: 'baldar',
    nameHe: 'בלדר',
    urlTemplate: null,
    aliases: ['baldar', 'בלדר', 'שליח', 'courier'],
  },
  {
    id: 'dhl',
    nameHe: 'DHL',
    urlTemplate: 'https://www.dhl.com/il-en/home/tracking.html?tracking-id={tracking}',
    aliases: ['dhl'],
  },
  {
    id: 'ups',
    nameHe: 'UPS',
    urlTemplate: 'https://www.ups.com/track?tracknum={tracking}',
    aliases: ['ups'],
  },
  {
    id: 'fedex',
    nameHe: 'FedEx',
    urlTemplate: 'https://www.fedex.com/fedextrack/?trknbr={tracking}',
    aliases: ['fedex', 'fed ex'],
  },
] as const

/** Folded for matching: lowercased, trimmed, inner runs of space collapsed. */
function fold(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The carrier a typed string names, or null.
 *
 * Matching is on the whole folded string, not `includes`. A substring rule
 * would let a note like "נמסר לשליח של דואר ישראל" match two carriers and pick
 * whichever came first in the list, which is a coin toss dressed as a lookup.
 */
export function findCarrier(typed: string | null | undefined): Carrier | null {
  if (!typed) return null
  const needle = fold(typed)
  if (!needle) return null
  for (const carrier of CARRIERS) {
    if (fold(carrier.id) === needle) return carrier
    if (fold(carrier.nameHe) === needle) return carrier
    if (carrier.aliases.some((alias) => fold(alias) === needle)) return carrier
  }
  return null
}

export interface TrackingView {
  /** What to print as the carrier: the known name, or the typed string. */
  carrierLabel: string | null
  /** The number, as recorded. Rendered LTR by the caller. */
  trackingNumber: string | null
  /** A URL to follow, or null. Null is a legitimate answer, not a failure. */
  url: string | null
}

/**
 * What a customer should see about a shipment.
 *
 * Returns null only when there is genuinely nothing to say — no carrier and no
 * number. A number without a recognised carrier is still shown: the customer
 * can give it to whoever calls, and hiding it because we could not build a link
 * would be withholding the one fact they came for.
 */
export function trackingView(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): TrackingView | null {
  const number = trackingNumber?.trim() || null
  const typed = carrier?.trim() || null
  if (!number && !typed) return null

  const known = findCarrier(typed)
  return {
    carrierLabel: known?.nameHe ?? typed,
    trackingNumber: number,
    // A template with no number to put in it produces a link to a search page
    // the customer cannot use, so both halves are required.
    url:
      known?.urlTemplate && number
        ? known.urlTemplate.replace('{tracking}', encodeURIComponent(number))
        : null,
  }
}
