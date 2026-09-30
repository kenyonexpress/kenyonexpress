/**
 * The preferred delivery slot a shopper can name at checkout.
 *
 * WHAT IT IS AND IS NOT. The registry (`lib/shipping/methods.ts`) promises
 * "נשלח ישירות על ידי הספק, 3-7 ימי עסקים" and no supplier here runs a timed
 * fleet; the slot is the shopper's PREFERENCE, handed to the supplier with
 * the order, not a booking the platform can guarantee. The copy around the
 * picker says so, the field is optional, and "no preference" is the default.
 * A required slot dressed up as a booked window would be a promise nobody
 * downstream can keep.
 *
 * ISRAELI WEEK. Deliveries run Sunday to Thursday. Friday is a half day most
 * couriers do not use for residential drops and Saturday is Shabbat, so
 * neither is offered. Public holidays are NOT excluded: the calendar is not
 * modelled here, the slot is a preference, and a supplier who cannot deliver
 * on a holiday simply picks the next day, which is what happens today with
 * no slot at all.
 *
 * TIME ZONE. "Today" is the date in Asia/Jerusalem, wherever the server runs.
 * Vercel functions run in UTC, and at 01:00 Israel time the UTC date is still
 * yesterday; a slot list keyed on the UTC date would offer a day that has, in
 * Israel, already begun. Every date here is a plain `YYYY-MM-DD` string and
 * the weekday is computed from it, never from a `Date`'s local zone.
 *
 * EVERYTHING TAKES `now`. The list is generated on the server (page.tsx) and
 * rendered on the client, and a list computed from each side's own clock is
 * a hydration mismatch waiting for midnight. One `now`, passed in, decides.
 */

export type DeliveryWindowId = 'morning' | 'afternoon'

export type DeliveryWindow = {
  id: DeliveryWindowId
  /** Hebrew label the picker renders. */
  label: string
  /** Wall-clock range, shown beside the label. */
  hours: string
}

export const DELIVERY_WINDOWS: readonly DeliveryWindow[] = [
  { id: 'morning', label: 'בוקר', hours: '09:00-13:00' },
  { id: 'afternoon', label: 'אחר הצהריים', hours: '13:00-17:00' },
]

export type DeliverySlot = {
  /** `YYYY-MM-DD`, an Israeli calendar date. */
  date: string
  window: DeliveryWindowId
  /** What the form posts: `date|window`. */
  value: string
  /** Business days after "today" this date falls on; 1 is the next delivery day. */
  offset: number
  /** e.g. "יום ראשון, 5.10.2026, בוקר (09:00-13:00)". */
  label: string
  /** The date part of `label`, for an optgroup heading. */
  dateLabel: string
}

/** Sunday..Thursday, as `Date.getUTCDay()` numbers them. */
const DELIVERY_WEEKDAYS = new Set([0, 1, 2, 3, 4])

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** How far ahead a slot may be asked for, in calendar days. Beyond it the estimate is fiction. */
export const DELIVERY_SLOT_MAX_DAYS_AHEAD = 30

/** Default earliest slot when the city is unknown: the registry's own lower bound. */
export const DEFAULT_MIN_BUSINESS_DAYS = 3

/** How many delivery days the picker offers past the earliest one. */
export const DELIVERY_SLOT_SPAN_DAYS = 10

/** The calendar date in Israel for an instant. */
export function jerusalemDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD, which is the only reason that locale is here.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function parts(iso: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE.exec(iso)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  // Round-trip through UTC so 2026-02-30 is refused rather than rolled over.
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null
  }
  return { y, m, d }
}

function toUtc(iso: string): Date {
  const p = parts(iso)
  if (!p) throw new Error(`not a calendar date: ${iso}`)
  return new Date(Date.UTC(p.y, p.m - 1, p.d))
}

function fromUtc(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isCalendarDate(iso: string): boolean {
  return parts(iso) !== null
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return fromUtc(date)
}

/** 0 = Sunday .. 6 = Saturday, from the calendar date alone. */
export function weekdayOf(iso: string): number {
  return toUtc(iso).getUTCDay()
}

export function isDeliveryDay(iso: string): boolean {
  return DELIVERY_WEEKDAYS.has(weekdayOf(iso))
}

/** Calendar days between two dates, positive when `later` is after `earlier`. */
export function daysBetween(earlier: string, later: string): number {
  return Math.round((toUtc(later).getTime() - toUtc(earlier).getTime()) / 86_400_000)
}

/** Israeli short date, day first, no padding: 5.10.2026. */
export function formatIsraeliDate(iso: string): string {
  const p = parts(iso)
  if (!p) throw new Error(`not a calendar date: ${iso}`)
  return `${p.d}.${p.m}.${p.y}`
}

export function windowById(id: string): DeliveryWindow | null {
  return DELIVERY_WINDOWS.find((window) => window.id === id) ?? null
}

export function encodeDeliverySlot(date: string, window: DeliveryWindowId): string {
  return `${date}|${window}`
}

/**
 * Splits a posted value back into its two parts. Shape only: a well-formed
 * value for a Saturday parses fine here and is refused by `validateDeliverySlot`.
 */
export function parseDeliverySlot(
  value: string | null | undefined,
): { date: string; window: DeliveryWindowId } | null {
  if (!value) return null
  const [date, windowId, ...rest] = value.split('|')
  if (!date || !windowId || rest.length > 0) return null
  if (!isCalendarDate(date)) return null
  const window = windowById(windowId)
  if (!window) return null
  return { date, window: window.id }
}

export function deliverySlotDateLabel(date: string): string {
  return `יום ${WEEKDAY_NAMES[weekdayOf(date)]}, ${formatIsraeliDate(date)}`
}

export function deliverySlotLabel(date: string, windowId: DeliveryWindowId): string {
  const window = windowById(windowId)
  if (!window) throw new Error(`unknown delivery window: ${windowId}`)
  return `${deliverySlotDateLabel(date)}, ${window.label} (${window.hours})`
}

/**
 * The slots to offer: every delivery day from the first business day after
 * today through `spanDays` delivery days later, two windows each, with the
 * business-day `offset` on every slot so the picker can drop the ones before
 * a city's estimate without a second calendar walk.
 *
 * Starts at offset 1, not at the estimate: the estimate depends on the city
 * the shopper is typing into the field above, and the list is built on the
 * server before that is known. Filtering is the client's, generating is not.
 */
export function listDeliverySlots({
  now,
  spanDays = DELIVERY_SLOT_SPAN_DAYS,
  maxOffset = DEFAULT_MIN_BUSINESS_DAYS + DELIVERY_SLOT_SPAN_DAYS,
}: {
  now: Date
  spanDays?: number
  maxOffset?: number
}): DeliverySlot[] {
  const today = jerusalemDate(now)
  const slots: DeliverySlot[] = []
  let cursor = today
  let offset = 0
  // Bounded by calendar days too, so a caller asking for a huge span cannot
  // spin past the 30-day window the validator enforces anyway.
  for (let step = 0; step < DELIVERY_SLOT_MAX_DAYS_AHEAD && offset < maxOffset; step += 1) {
    cursor = addDays(cursor, 1)
    if (!isDeliveryDay(cursor)) continue
    offset += 1
    if (spanDays <= 0) break
    for (const window of DELIVERY_WINDOWS) {
      slots.push({
        date: cursor,
        window: window.id,
        value: encodeDeliverySlot(cursor, window.id),
        offset,
        label: deliverySlotLabel(cursor, window.id),
        dateLabel: deliverySlotDateLabel(cursor),
      })
    }
  }
  return slots
}

export type DeliverySlotCheck =
  | { ok: true; date: string; window: DeliveryWindowId; label: string }
  | { ok: false; message: string }

/**
 * What the server accepts from the form.
 *
 * Deliberately looser than the list the client showed: a shopper who opened
 * the page before midnight and paid after it must not be told their choice is
 * invalid, so the rule is "a delivery day, from tomorrow, within 30 days" and
 * not "one of the exact values rendered". The city-dependent minimum is a
 * courtesy on the client and nothing to refuse an order over.
 */
export function validateDeliverySlot(
  value: string | null | undefined,
  { now }: { now: Date },
): DeliverySlotCheck {
  const parsed = parseDeliverySlot(value)
  if (!parsed) return { ok: false, message: 'מועד המסירה שנבחר אינו תקין' }
  const today = jerusalemDate(now)
  const ahead = daysBetween(today, parsed.date)
  if (ahead < 1) return { ok: false, message: 'מועד המסירה חייב להיות ממחר והלאה' }
  if (ahead > DELIVERY_SLOT_MAX_DAYS_AHEAD) {
    return { ok: false, message: 'מועד המסירה רחוק מדי, בחרו מועד בחודש הקרוב' }
  }
  if (!isDeliveryDay(parsed.date)) {
    return { ok: false, message: 'משלוחים מתבצעים בימים ראשון עד חמישי' }
  }
  return {
    ok: true,
    date: parsed.date,
    window: parsed.window,
    label: deliverySlotLabel(parsed.date, parsed.window),
  }
}

/** The line written into the order notes so the supplier reads it with the order. */
export function deliverySlotNoteLine(label: string): string {
  return `מועד מסירה מועדף: ${label}`
}
