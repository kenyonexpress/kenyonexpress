/**
 * The hours a person answers (STEP 52), in ONE place.
 *
 * WHY A MODULE AND NOT A DATABASE ROW. Nothing queries this: the contact page
 * prints it, the "open now" badge computes from it, and the `ContactPoint`
 * structured data on the same page declares it. Three readers of one table,
 * all in the render path of a static page. A row would need a migration that
 * is not approved and an admin screen nobody asked for, and would turn a
 * prerendered page into a request-time read for a value that changes a few
 * times a year.
 *
 * WHY THESE HOURS. Nothing in the repo, the captured live site or the specs
 * publishes support hours (measured: zero matches for שעות פעילות / שעות
 * מענה / openingHours outside the supplier-SEO plans). The schedule below is
 * the conservative Israeli office week: Sunday to Thursday 09:00 to 18:00,
 * Friday and holiday eves 09:00 to 13:00, Saturday and holidays closed.
 * Changing it is one edit to `SUPPORT_WEEK`; everything else derives.
 *
 * TIME ZONE. Vercel functions run in UTC and the customer's browser runs
 * wherever they are. "Open now" is a fact about Israel, so every clock read
 * goes through `Intl.DateTimeFormat` with `Asia/Jerusalem`, which also means
 * DST is handled by the ICU tables and never by hand. The same technique
 * `lib/checkout/delivery-slots.ts` uses for "today".
 *
 * HOLIDAYS ARE COPY, NOT CODE. There is no Jewish-calendar table in the repo
 * (delivery slots say so too), so the badge cannot know that today is a
 * holiday; it says "open" on Yom Kippur. The printed table carries the rule
 * in words, which is the honest thing a page can say without the calendar.
 */

export const SUPPORT_TIME_ZONE = 'Asia/Jerusalem'

/** Minutes after midnight, so the arithmetic is integer and the test is readable. */
export type SupportDay = {
  /** 0 = Sunday ... 6 = Saturday, the JS convention. */
  weekday: number
  /** Opening minute, or null when closed all day. */
  opens: number | null
  /** Closing minute (exclusive), or null when closed all day. */
  closes: number | null
}

const H = (hours: number, minutes = 0): number => hours * 60 + minutes

export const SUPPORT_WEEK: readonly SupportDay[] = [
  { weekday: 0, opens: H(9), closes: H(18) },
  { weekday: 1, opens: H(9), closes: H(18) },
  { weekday: 2, opens: H(9), closes: H(18) },
  { weekday: 3, opens: H(9), closes: H(18) },
  { weekday: 4, opens: H(9), closes: H(18) },
  { weekday: 5, opens: H(9), closes: H(13) },
  { weekday: 6, opens: null, closes: null },
]

/** Hebrew weekday names, JS index order. */
export const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const

/** schema.org day names, JS index order. */
const SCHEMA_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/**
 * The rows the page prints. Grouped by hand rather than derived, because the
 * grouping carries words the table does not ("וערבי חג", "וחגים") and a
 * derived label would have to invent them. `support-hours.test.ts` pins each
 * row to the `SUPPORT_WEEK` days it claims to describe, so the two cannot
 * drift.
 */
export const SUPPORT_HOURS_ROWS: readonly {
  label: string
  weekdays: readonly number[]
  hours: string
}[] = [
  { label: 'ראשון עד חמישי', weekdays: [0, 1, 2, 3, 4], hours: '09:00 עד 18:00' },
  { label: 'שישי וערבי חג', weekdays: [5], hours: '09:00 עד 13:00' },
  { label: 'שבת וחגים', weekdays: [6], hours: 'סגור' },
]

/**
 * What the customer is told to expect, per channel. Copy, in one place, so
 * the page and the auto-reply (when there is one) cannot promise different
 * things.
 */
export const SUPPORT_RESPONSE = {
  whatsapp: 'בשעות הפעילות עונים בדרך כלל תוך שעה.',
  form: 'לפניות בטופס או במייל חוזרים עד יום עסקים אחד.',
  afterHours: 'פנייה מחוץ לשעות הפעילות נענית ביום העסקים הבא.',
} as const

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * The wall clock in Israel for an instant: weekday and minutes since midnight.
 *
 * `hourCycle: 'h23'` matters: without it some ICU builds print midnight as
 * "24", and `Number('24')` is a 25th hour.
 */
export function jerusalemClock(now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SUPPORT_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  let weekday = 0
  let hour = 0
  let minute = 0
  for (const part of parts) {
    if (part.type === 'weekday') weekday = WEEKDAY_INDEX[part.value] ?? 0
    else if (part.type === 'hour') hour = Number(part.value) % 24
    else if (part.type === 'minute') minute = Number(part.value)
  }
  return { weekday, minutes: hour * 60 + minute }
}

export type SupportStatus =
  | { open: true; closesAt: string }
  | {
      open: false
      /** Days ahead of today in Israel: 0 = later today, 1 = tomorrow. */
      opensInDays: number
      opensWeekday: number
      opensAt: string
    }

function dayFor(weekday: number): SupportDay {
  return SUPPORT_WEEK[((weekday % 7) + 7) % 7] as SupportDay
}

/** Open or closed at this instant, and when that changes. Pure: `now` is passed in. */
export function supportStatus(now: Date): SupportStatus {
  const { weekday, minutes } = jerusalemClock(now)
  const today = dayFor(weekday)
  if (today.opens !== null && today.closes !== null) {
    if (minutes >= today.opens && minutes < today.closes) {
      return { open: true, closesAt: formatMinutes(today.closes) }
    }
    if (minutes < today.opens) {
      return {
        open: false,
        opensInDays: 0,
        opensWeekday: weekday,
        opensAt: formatMinutes(today.opens),
      }
    }
  }
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const next = dayFor(weekday + ahead)
    if (next.opens !== null) {
      return {
        open: false,
        opensInDays: ahead,
        opensWeekday: next.weekday,
        opensAt: formatMinutes(next.opens),
      }
    }
  }
  // Unreachable while any day of SUPPORT_WEEK is open; typed so a fully closed
  // week fails loudly instead of returning "open".
  throw new Error('SUPPORT_WEEK has no open day')
}

/** The Hebrew sentence the badge prints for a status. */
export function supportStatusLabel(status: SupportStatus): string {
  if (status.open) return `פתוח עכשיו, עונים עד ${status.closesAt}`
  if (status.opensInDays === 0) return `סגור עכשיו, נפתח היום ב-${status.opensAt}`
  if (status.opensInDays === 1) return `סגור עכשיו, נפתח מחר ב-${status.opensAt}`
  return `סגור עכשיו, נפתח ביום ${HEBREW_WEEKDAYS[status.opensWeekday]} ב-${status.opensAt}`
}

/**
 * `OpeningHoursSpecification` nodes for a `ContactPoint`, one per open day.
 * Closed days are simply absent, which is how schema.org reads "closed".
 */
export function supportOpeningHoursSpecification(): Record<string, unknown>[] {
  return SUPPORT_WEEK.filter((d) => d.opens !== null && d.closes !== null).map((d) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: SCHEMA_WEEKDAYS[d.weekday],
    opens: formatMinutes(d.opens as number),
    closes: formatMinutes(d.closes as number),
  }))
}
