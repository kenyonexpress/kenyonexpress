import { type Agorot, agorot } from '@/lib/commerce/money'

/**
 * When a struck-through "before" price may lawfully be shown.
 *
 * THE LAW, AND WHY IT IS NOT "WHATEVER THE ADMIN TYPED"
 *
 * Israeli consumer law treats an advertised saving as a factual claim about
 * what the trader used to charge, not as decoration. תקנות הגנת הצרכן (מכירה
 * מיוחדת) require a special sale to state the price the goods were actually
 * sold at beforehand, and the enforcement practice that has grown around it --
 * the same shape as the EU Omnibus rule the Israeli guidance tracks -- reads
 * "beforehand" as the LOWEST price the trader charged in the 30 days before the
 * discount began. A reference price higher than that is a saving the shopper
 * never actually gets.
 *
 * `products.full_price` is a number an operator types into a form. Nothing has
 * ever checked it against anything, and eight components paint a price with a
 * line through it -- all eight are named in `reference-surfaces.test.ts`.
 * Measured against production on 2026-09-09:
 *
 *   44  active products
 *   15  showing a struck-through `full_price` above the price charged
 *   20  products with any price change recorded anywhere (in `audit_log`)
 *    0  products in BOTH sets
 *
 * The intersection is empty. Not "hard to prove": there is no evidence, for any
 * of the fifteen claims currently on the site, that the struck-through price
 * was ever charged. `audit_log` is not a substitute -- it holds 555 product
 * rows and only 21 of them mention `kenyon_price` at all, because it records
 * the edits that happened to go through the audited path rather than the price
 * on every day.
 *
 * WHAT THIS MODULE IS, AND IS NOT
 *
 * Pure. No database, no clock: the window end is passed in. That is what lets
 * the storefront, the admin warning and the tests agree by construction rather
 * than by three implementations happening to match -- the failure this codebase
 * already had once, where the product page rendered one number and checkout
 * billed another.
 *
 * It decides ONE thing: may this claim be shown. It does not decide what to
 * render instead, and it does not touch the price actually charged. The charged
 * price is `kenyon_price` in every case; suppressing a reference price removes
 * a claim about the past, never a number from the total.
 */

/**
 * The window, in days.
 *
 * 30 is the figure the regulations and the guidance both use. It is a constant
 * and not a setting, because a shorter window configured by whoever is under
 * pressure to run a sale is the exact thing the rule exists to prevent.
 */
export const REFERENCE_WINDOW_DAYS = 30

/** One day's observed selling price for one product. */
export interface PriceObservation {
  /** Calendar date in Asia/Jerusalem, `YYYY-MM-DD`. */
  observedOn: string
  /** What the shopper would have paid that day, VAT included. */
  priceAgorot: Agorot
}

export type ReferenceVerdict =
  /** No "before" price is being claimed. Nothing to justify. */
  | { kind: 'not_claimed' }
  /** The claim is supported by the record and may be shown. */
  | {
      kind: 'compliant'
      referenceAgorot: Agorot
      lowestAgorot: Agorot
      daysObserved: number
    }
  /**
   * The record cannot support the claim OR contradict it. Distinct from
   * `violating` on purpose: "we have not been watching long enough" and "we
   * watched and it is false" are different facts, and collapsing them would
   * make the day the history matures invisible.
   */
  | {
      kind: 'unproven'
      reason: 'no_history' | 'window_too_short'
      daysObserved: number
      daysRequired: number
    }
  /** The record contradicts the claim. */
  | {
      kind: 'violating'
      reason: 'not_above_current' | 'above_lowest_charged'
      referenceAgorot: Agorot
      lowestAgorot: Agorot | null
      daysObserved: number
    }

export interface ReferenceCheckInput {
  /** What the shopper pays today, VAT included. */
  currentAgorot: Agorot
  /** The struck-through claim, or null when the product makes none. */
  referenceAgorot: Agorot | null
  /** Observations for this product. Order does not matter; duplicates by date collapse. */
  observations: readonly PriceObservation[]
  /** Last day of the window, `YYYY-MM-DD` in Asia/Jerusalem. Usually today. */
  windowEndsOn: string
}

/** `YYYY-MM-DD` -> days since epoch. Calendar arithmetic, no timezone in it. */
function dayNumber(iso: string): number {
  const parsed = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed)) throw new RangeError(`not a YYYY-MM-DD date: "${iso}"`)
  return Math.floor(parsed / 86_400_000)
}

/**
 * Decide whether `referenceAgorot` may be shown struck through.
 *
 * The window is the `REFERENCE_WINDOW_DAYS` days ENDING on `windowEndsOn`,
 * inclusive of both ends.
 *
 * FULL COVERAGE IS REQUIRED, AND THAT IS THE STRICT READING ON PURPOSE. The
 * claim is about the lowest price across a 30-day window; a window with holes
 * cannot produce that number, because the lowest price could be on a day nobody
 * recorded. Accepting partial coverage would mean the check passes most easily
 * exactly when the history is thinnest -- on day one, when nothing is known.
 *
 * It is also what makes this self-tightening rather than a flag someone has to
 * remember to turn on. A product whose history starts today returns `unproven`
 * today and, if the claim is not supported, `violating` on day 30 with nobody
 * touching anything.
 */
export function checkReferencePrice(input: ReferenceCheckInput): ReferenceVerdict {
  const { currentAgorot, referenceAgorot, observations, windowEndsOn } = input

  if (referenceAgorot === null) return { kind: 'not_claimed' }

  const end = dayNumber(windowEndsOn)
  const start = end - (REFERENCE_WINDOW_DAYS - 1)

  // One row per calendar day. Two observations for the same day is a re-run of
  // the snapshot, not two prices, and the lower one is the one a shopper could
  // have paid.
  const byDay = new Map<number, Agorot>()
  for (const o of observations) {
    const day = dayNumber(o.observedOn)
    if (day < start || day > end) continue
    const seen = byDay.get(day)
    if (seen === undefined || o.priceAgorot < seen) byDay.set(day, o.priceAgorot)
  }
  const daysObserved = byDay.size

  // Checked BEFORE coverage. A reference at or below the price being charged is
  // not a saving in any window, so waiting 30 days to say so would leave a
  // nonsensical claim on the page for a month.
  if (referenceAgorot <= currentAgorot) {
    return {
      kind: 'violating',
      reason: 'not_above_current',
      referenceAgorot,
      lowestAgorot: daysObserved > 0 ? agorot(Math.min(...byDay.values())) : null,
      daysObserved,
    }
  }

  if (daysObserved === 0) {
    return {
      kind: 'unproven',
      reason: 'no_history',
      daysObserved,
      daysRequired: REFERENCE_WINDOW_DAYS,
    }
  }
  if (daysObserved < REFERENCE_WINDOW_DAYS) {
    return {
      kind: 'unproven',
      reason: 'window_too_short',
      daysObserved,
      daysRequired: REFERENCE_WINDOW_DAYS,
    }
  }

  const lowest = agorot(Math.min(...byDay.values()))

  // `<=` and not `<`. A reference EQUAL to the lowest price charged is the
  // honest claim -- it says the shopper saves what they actually save. A
  // reference above it advertises a saving nobody was ever charged.
  if (referenceAgorot <= lowest) {
    return { kind: 'compliant', referenceAgorot, lowestAgorot: lowest, daysObserved }
  }

  return {
    kind: 'violating',
    reason: 'above_lowest_charged',
    referenceAgorot,
    lowestAgorot: lowest,
    daysObserved,
  }
}

/**
 * May the storefront paint the strike-through?
 *
 * `unproven` says YES, and that is the one judgement call in this file, so it
 * is written down rather than buried in a boolean.
 *
 * Suppressing every unproven claim today would blank the "מחיר רגיל" line on 15
 * of 44 products at once, on the strength of an absence of evidence rather than
 * evidence of a false claim. Those prices may well be genuine; nobody was
 * recording. Showing a claim we have measured to be FALSE is a different act,
 * and that one is refused.
 *
 * This is not a permanent amnesty and it is not a flag. Once
 * `REFERENCE_WINDOW_DAYS` of history exists for a product, `unproven` is no
 * longer reachable for it: the verdict becomes `compliant` or `violating` on
 * the evidence, and an unsupported claim starts being suppressed on its own.
 * With the snapshot starting 2026-09-09 the first products cross that line on
 * 2026-10-08.
 *
 * The admin is warned on `unproven` regardless -- see `referenceWarning`.
 */
export function mayShowReference(verdict: ReferenceVerdict): boolean {
  return verdict.kind === 'compliant' || verdict.kind === 'unproven'
}

/** Hebrew, for the admin. `null` when there is nothing to say. */
export function referenceWarning(verdict: ReferenceVerdict): string | null {
  switch (verdict.kind) {
    case 'not_claimed':
    case 'compliant':
      return null
    case 'unproven':
      return verdict.reason === 'no_history'
        ? `אין היסטוריית מחירים למוצר הזה, ולכן אי אפשר להוכיח שהמחיר המוצג במחיקה אכן נגבה. נדרשים ${REFERENCE_WINDOW_DAYS} ימי מדידה.`
        : `יש ${verdict.daysObserved} מתוך ${verdict.daysRequired} ימי מדידה. עד שהחלון יתמלא אי אפשר להוכיח את המחיר שלפני ההנחה.`
    case 'violating':
      return verdict.reason === 'not_above_current'
        ? 'המחיר שלפני ההנחה אינו גבוה מהמחיר הנגבה, ולכן אינו מציג חיסכון.'
        : 'המחיר שלפני ההנחה גבוה מהמחיר הנמוך ביותר שנגבה בפועל ב-30 הימים האחרונים. ' +
            'הצגתו במחיקה אינה עומדת בדרישות חוק הגנת הצרכן.'
  }
}
