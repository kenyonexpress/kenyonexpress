import { type Agorot, ilsToAgorot } from '@/lib/commerce/money'

/**
 * A PRICE THAT IS TOO GOOD TO BE TRUE IS A DATA ERROR, NOT AN OFFER.
 *
 * WHAT THIS EXISTS FOR. `products` carries a row the WordPress import left
 * behind -- `9bb347f8-03ec-48ce-8ff2-2503fb74c895`, "מוצר ראשי מאסטר Master
 * Product" -- selling at ₪1 against a ₪400 compare-at, ten in stock, status
 * active. It renders on the homepage grid as a real buyable product wearing a
 * "-100%" badge. If anyone buys one, the order is real, the payment is real,
 * and there is nothing to fulfil. `migrations/pending/172` takes it out of the
 * catalogue and is the actual fix, but it needs approval before it touches
 * production, and until then the row is live and purchasable.
 *
 * WHY NOT A DENYLIST. Blocking that row by name or by id is a rule nobody can
 * maintain: it hides a real product the day one is legitimately called
 * "master", it does not survive the row being re-imported under a new id, and
 * it protects against exactly one instance of a defect that has a class. There
 * are already three OTHER live products with "מאסטר" in the name -- "עיסוי
 * מאסטר", "! צימר מאסטר" -- and every one of them is a genuine listing.
 *
 * THE THRESHOLD IS MEASURED, NOT CHOSEN. Queried against production on
 * 2026-09-06, over the 24 active products that carry both a sell price and a
 * compare-at, sorted by depth of discount:
 *
 *   99.75%   מוצר ראשי מאסטר Master Product      ₪1 of ₪400
 *   60.00%   תספורת לגבר, ילד, סידור זקן         ₪20 of ₪50
 *   50.00%   הסרת שיער בלייזר קר                 ₪250 of ₪500
 *   49.23%   תיק עור JEEP יוקרתי                 ₪99 of ₪195
 *   37.56%   קמפיין ענק בפייסבוק                 ₪999 of ₪1600
 *   ...
 *
 * The deepest discount a human has ever entered on this catalogue is 60%. The
 * offending row sits alone at 99.75%, nearly forty points clear of it. A
 * ceiling of 95% therefore has 35 points of headroom above every real listing
 * and still catches the one that is wrong -- the business can run a 90%-off
 * campaign and nothing here fires. Counted at each step: 3 products are at or
 * past 50% off, exactly 1 is past 80%, and that 1 is the same row at every
 * threshold from 80% to 98%.
 *
 * WHAT IT CATCHES BESIDES. The general shape is a misplaced decimal: a supplier
 * entering 10 where they meant 1000, against a compare-at they typed
 * correctly. That is the same defect and it has not happened yet only because
 * the catalogue is small.
 *
 * WHAT IT IS NOT. This is a refusal to SELL, not a correction. It never edits a
 * price and never invents one -- a guard that quietly repaired the number would
 * be selling at a price nobody approved, which is worse than refusing. And it
 * is not a substitute for 172: an application guard stops the money moving,
 * while the row is still in the database and still answers a direct query. Both
 * are wanted, and only one of them can be done without approval tonight.
 */

/**
 * The deepest discount this catalogue will sell, as a whole percent.
 *
 * A whole number rather than a fraction so the comparison below stays in
 * integer arithmetic all the way through. See the measured distribution above
 * for why it is 95 and not something rounder.
 */
export const MAX_PLAUSIBLE_DISCOUNT_PERCENT = 95

/**
 * Is this sell price an implausible fraction of its own compare-at price?
 *
 * THE AGOROT FORM IS THE PRIMARY ONE. Callers that already hold the converted
 * price pass it straight in, so the number this refuses to sell at is the exact
 * number the checkout would have charged, rather than a second conversion of
 * the same column that could round differently.
 *
 * INTEGER ARITHMETIC ONLY, in agorot, per the money rule. The obvious way to
 * write this is `1 - sell / compareAt > 0.95`, and that is a float on the money
 * path. Multiplying out instead keeps it exact:
 *
 *     sell / compareAt  <=  (100 - MAX) / 100
 *     sell * 100        <=  compareAt * (100 - MAX)
 *
 * Both sides are products of integers, so there is no rounding to disagree
 * about and no epsilon to tune. At MAX = 95 the test is
 * `sellAgorot * 100 <= compareAtAgorot * 5`.
 *
 * Returns false whenever the comparison is not meaningful: an absent or
 * non-positive compare-at is not a discount at all, and a sell price at or
 * above the compare-at is not one either. Those are ordinary states, and a
 * guard that treated a missing column as a fault would refuse to sell most of
 * the catalogue.
 */
export function isImplausibleDiscountAgorot(
  sellAgorot: Agorot | null,
  compareAtAgorot: Agorot | null,
): boolean {
  if (sellAgorot == null || compareAtAgorot == null) return false
  if (compareAtAgorot <= 0) return false
  if (sellAgorot >= compareAtAgorot) return false

  return sellAgorot * 100 <= compareAtAgorot * (100 - MAX_PLAUSIBLE_DISCOUNT_PERCENT)
}

/**
 * The same question asked of two raw catalogue values.
 *
 * For callers holding `numeric` columns straight off a PostgREST read rather
 * than a converted `Agorot`. It converts and delegates -- it does NOT reimplement
 * the comparison, because two copies of a money rule is how the two answers
 * drift.
 *
 * `ilsToAgorot(Number(x).toFixed(2))` is the repo's sanctioned boundary idiom,
 * enforced by `src/__tests__/money-no-float.test.ts`, and it is spelled exactly
 * that way here rather than allowlisted: `ilsToAgorot` rejects anything with
 * more than two fraction digits, and a `numeric(12,2)` column that arrives as a
 * JS number can print as `1.0000000000000002`. Routing strings through `Number`
 * too keeps the two input shapes on one path instead of two that can disagree.
 *
 * Anything still unparseable returns false rather than throwing -- an
 * unreadable price is not this module's finding to make, `unpriced` in the cart
 * pricer already refuses those, and claiming it here would report the wrong
 * reason for the refusal. Throwing would be worse: this runs inside
 * `buildCartView`, which prices every line of every cart.
 */
export function isImplausibleDiscount(
  sellIls: string | number | null | undefined,
  compareAtIls: string | number | null | undefined,
): boolean {
  if (sellIls == null || compareAtIls == null) return false

  try {
    return isImplausibleDiscountAgorot(toAgorot(sellIls), toAgorot(compareAtIls))
  } catch {
    return false
  }
}

function toAgorot(value: string | number): Agorot {
  return ilsToAgorot(Number(value).toFixed(2))
}
