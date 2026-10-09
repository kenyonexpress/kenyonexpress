/**
 * The decisions behind the wishlist alerts, with no client and no clock of
 * their own, so the cron routes stay thin and what a customer is mailed about
 * can be tested directly.
 *
 * WHERE A "PREVIOUS PRICE" COMES FROM. `price_history` (193) is append-only
 * and may carry several rows per day; its own header instructs the reader to
 * take the LOWEST price of a day, because that is the price a shopper could
 * actually have paid. A drop is therefore: the lowest price of the most
 * recent observed day BEFORE today, compared against the price charged now.
 * Comparing against "the price when the user saved it" was considered and
 * rejected: a product saved at 400 that fell to 300 last month and 290 today
 * would mail "dropped from 400" every run under that definition, while this
 * one mails each new floor exactly once (the dedupe key carries the new
 * price).
 */

export interface PriceObservation {
  observed_on: string
  price_agorot: number
}

/**
 * The lowest price of the most recent observed day strictly before `todayKey`
 * (a `YYYY-MM-DD` calendar day in Asia/Jerusalem, same convention the table
 * stores). Null when there is no earlier day to compare against, which is the
 * first day a product ever appears; a drop needs a "before".
 */
export function previousObservedPrice(
  rows: readonly PriceObservation[],
  todayKey: string,
): number | null {
  let bestDay: string | null = null
  let bestPrice: number | null = null
  for (const row of rows) {
    if (row.observed_on >= todayKey) continue
    if (!Number.isFinite(row.price_agorot) || row.price_agorot < 0) continue
    if (bestDay === null || row.observed_on > bestDay) {
      bestDay = row.observed_on
      bestPrice = row.price_agorot
    } else if (
      row.observed_on === bestDay &&
      (bestPrice === null || row.price_agorot < bestPrice)
    ) {
      bestPrice = row.price_agorot
    }
  }
  return bestPrice
}

export interface PriceDrop {
  oldAgorot: number
  newAgorot: number
}

/**
 * Money is integer agorot end to end; nothing here divides. A "drop" of zero
 * or a rise returns null, and so does a current price of zero, because a
 * product priced at nothing is a data problem and not a bargain to advertise.
 */
export function detectPriceDrop(
  previousAgorot: number | null,
  currentAgorot: number | null | undefined,
): PriceDrop | null {
  if (previousAgorot === null || previousAgorot <= 0) return null
  if (typeof currentAgorot !== 'number' || !Number.isFinite(currentAgorot)) return null
  if (currentAgorot <= 0 || currentAgorot >= previousAgorot) return null
  return { oldAgorot: previousAgorot, newAgorot: currentAgorot }
}

/**
 * What "in stock" means for alert purposes: NULL is untracked inventory,
 * which the shop treats as always available (195 measured 19 such products),
 * and zero or less is sold out. Only an active, undeleted product counts at
 * all; a draft coming back to stock is not on sale.
 */
export function isInStock(stockQuantity: number | null, status: string | null): boolean {
  if (status !== 'active') return false
  return stockQuantity === null || stockQuantity > 0
}

/**
 * Dedupe keys, in one place so the enqueue and any later requeue tooling
 * agree. The outbox has a UNIQUE on the key with ON CONFLICT DO NOTHING, so
 * these ARE the "only once" guarantees:
 *
 *   price drop:    once per user per product per new price. The same floor
 *                  never mails twice; a further drop is a new key.
 *   back in stock: once per user per product per calendar day of the flip, so
 *                  a product that oscillates within one day mails once, and a
 *                  genuine restock next month mails again.
 */
export function priceDropDedupeKey(userId: string, productId: string, newAgorot: number): string {
  return `price_drop:${userId}:${productId}:${newAgorot}`
}

export function backInStockDedupeKey(userId: string, productId: string, dayKey: string): string {
  return `back_in_stock:${userId}:${productId}:${dayKey}`
}

export function waitlistDedupeKey(rowId: string): string {
  // The waitlist row id is already one person, one product, one request.
  return `back_in_stock:waitlist:${rowId}`
}

/** The ISO week key the digest's idempotency rides on, e.g. `2026-W37`. */
export function isoWeekKey(date: Date): string {
  // ISO 8601: week 1 contains the year's first Thursday. Shift to the
  // Thursday of this date's week, and the year of that Thursday is the ISO
  // year even across a New Year boundary.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
