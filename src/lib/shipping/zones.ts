import type { Agorot } from '@/lib/commerce/money'
import { agorot } from '@/lib/commerce/money'

/**
 * What delivery costs, by where it is going.
 *
 * THE STATE THIS ARRIVED IN, MEASURED 2026-09-09
 *
 * Nothing charges for delivery. `orders` has no shipping column, the cart view
 * has no shipping line, `calculateSettlement` has no shipping input, and all 44
 * active products carry `requires_shipping = true`. Delivery is free, for
 * everyone, everywhere.
 *
 * That is not an oversight. `TopBar` prints **"משלוח מהיר חינם"** on every page
 * of the site, unconditionally, and the product page promises "3-7 ימי עסקים"
 * with no fee beside it. The absence of a charge and the presence of that
 * banner are the same decision, made once, and the code is consistent with it.
 *
 * SO WHY BUILD THIS AT ALL
 *
 * Because "free" is currently expressed as an absence, and an absence cannot be
 * changed carefully. There is no place to put "Eilat costs more", no place to
 * put "free over ₪199", and no way to tell whether free-everywhere was chosen
 * or merely never implemented. This module makes the policy a value: today it
 * says free everywhere, which is what the site already does, and tomorrow it can
 * say something else in one place instead of in five.
 *
 * IT IS NOT WIRED INTO CHECKOUT, AND THAT IS DELIBERATE
 *
 * Wiring it would change what a customer is charged, which needs rates nobody
 * has set, and it would contradict a promise printed on every page. Changing
 * that banner is a business decision, not an engineering one. `zones.test.ts`
 * holds the two together: a zone with a surcharge, configured while the banner
 * still says free, fails the suite. The contradiction cannot be introduced
 * quietly from either side.
 */

/**
 * The zones, by the geography that actually changes a courier's price in
 * Israel. Not by administrative district: a מחוז boundary is not what makes a
 * parcel expensive.
 */
export type ZoneId =
  /** Gush Dan and the central corridor. Every courier's base rate. */
  | 'center'
  /** North: Haifa, Galilee, Golan. */
  | 'north'
  /** South down to Beersheba. */
  | 'south'
  /**
   * Eilat and the Arava. Separate from `south` on purpose and it is the one
   * split that is not arbitrary: it is a four-hour drive past the last
   * distribution point, and every Israeli courier prices it apart. It is also
   * where a flat national rate quietly loses money.
   */
  | 'eilat'
  /**
   * Anywhere a courier declines to deliver to the door or charges by
   * arrangement. Kept as a zone rather than as an error so an order to one can
   * be REFUSED with a reason rather than silently quoted the central rate.
   */
  | 'remote'

export interface ZoneRule {
  id: ZoneId
  nameHe: string
  /** Base delivery charge in agorot. */
  flatAgorot: Agorot
  /**
   * Order subtotal at or above which delivery is free, or null for "never
   * free". Compared against the subtotal, NOT the total: making the threshold
   * depend on a discount lets a coupon decide whether shipping is free, which
   * is two promotions interacting in a way nobody designed.
   */
  freeAboveAgorot: Agorot | null
  /** False when the courier will not deliver here at all. */
  deliverable: boolean
}

/**
 * TODAY'S POLICY: free everywhere, matching the banner.
 *
 * Every `flatAgorot` is zero and every `freeAboveAgorot` is zero, which reads
 * as "free from the first agora". They are written out per zone rather than
 * collapsed into one constant precisely so that changing one of them is a
 * one-line diff somebody has to look at.
 */
export const ZONE_RULES: readonly ZoneRule[] = [
  {
    id: 'center',
    nameHe: 'מרכז',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
  {
    id: 'north',
    nameHe: 'צפון',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
  {
    id: 'south',
    nameHe: 'דרום',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
  {
    id: 'eilat',
    nameHe: 'אילת והערבה',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
  {
    id: 'remote',
    nameHe: 'אזור מרוחק',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
] as const

export type ShippingQuote =
  | { ok: true; zone: ZoneId; amountAgorot: Agorot; free: boolean }
  | { ok: false; zone: ZoneId; reason: 'not_deliverable' | 'unknown_zone' }

export interface QuoteInput {
  zone: ZoneId | string
  /** The order subtotal in agorot, before any discount. */
  subtotalAgorot: Agorot
  /** True when the customer collects rather than receives. Always free. */
  pickup?: boolean
}

/**
 * What to charge for delivery.
 *
 * Integer agorot throughout, per the project rule: no float touches the money
 * path, and every branch here returns a value that came from the table or from
 * `agorot(0)`.
 */
export function quoteShipping(input: QuoteInput): ShippingQuote {
  const rule = ZONE_RULES.find((z) => z.id === input.zone)
  if (!rule) {
    // Not silently treated as `center`. A zone nobody recognised charged at the
    // cheapest rate is a loss that never surfaces; refused, it surfaces at
    // checkout where somebody can fix the address.
    return { ok: false, zone: 'remote', reason: 'unknown_zone' }
  }

  // Collection is free before anything else is considered. A pickup point in a
  // zone the courier refuses is still a place the customer can walk to, so this
  // outranks `deliverable`.
  if (input.pickup) return { ok: true, zone: rule.id, amountAgorot: agorot(0), free: true }

  if (!rule.deliverable) return { ok: false, zone: rule.id, reason: 'not_deliverable' }

  const free = rule.freeAboveAgorot !== null && input.subtotalAgorot >= rule.freeAboveAgorot
  return {
    ok: true,
    zone: rule.id,
    amountAgorot: free ? agorot(0) : rule.flatAgorot,
    free,
  }
}

/**
 * Is any zone currently charging for delivery?
 *
 * The question the banner depends on. `TopBar` says "משלוח מהיר חינם" with no
 * qualifier, and that sentence is only true while this returns false.
 */
export function anyZoneCharges(): boolean {
  return ZONE_RULES.some(
    (z) => z.flatAgorot > 0 && (z.freeAboveAgorot === null || z.freeAboveAgorot > 0),
  )
}
