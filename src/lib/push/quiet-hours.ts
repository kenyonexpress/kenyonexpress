/**
 * Quiet hours for push: nothing buzzes a phone between 22:00 and 08:00 Israel
 * time. A notification that falls in the window is held, not dropped, and goes
 * out at 08:00.
 *
 * WHY THIS IS A PUSH RULE AND NOT AN OUTBOX RULE. Mail at 03:00 sits unread in
 * an inbox; a push at 03:00 lights a screen on a nightstand. The outbox row and
 * its email leg are untouched by this file. Only the push leg looks here, and
 * it does so AFTER the customer's preferences have been read, so a kind the
 * customer switched off settles as skipped tonight rather than being held until
 * morning and skipped then.
 *
 * ISRAEL TIME, NOT SERVER TIME. The server runs in UTC on Vercel and the
 * customers are in one country. The window is defined in Asia/Jerusalem, which
 * is UTC+2 in winter and UTC+3 in summer, and `Intl` carries the transition
 * dates so this file does not have to. Every function takes `now` as a
 * parameter, because a rule about the clock is untestable against the real one.
 *
 * THE ONE EXEMPTION. `voucher_issued` is the coupon the customer paid for a
 * moment ago. They are awake, they are holding the phone, and the push is the
 * receipt for the act they just performed. Holding it until 08:00 would make
 * the purchase look as though it failed. Nothing else is exempt: a parcel
 * marked delivered at 23:00, a price that dropped overnight and a cashback
 * credit all read the same at 08:00 as they would at midnight.
 *
 * HELD, NOT COUNTED. The drain writes the release time into
 * `push_next_attempt_at` and leaves `push_attempts` alone. The five retries a
 * row is allowed exist for transport failures, and a deferral is not one.
 */

export const QUIET_HOURS_TIME_ZONE = 'Asia/Jerusalem'

/** The hour, in Israel local time, at which the window opens. Inclusive. */
export const QUIET_HOURS_START = 22

/** The hour at which it closes. Exclusive: 08:00 is already daytime. */
export const QUIET_HOURS_END = 8

/**
 * Kinds that may push inside the window. Pinned by name and kept to the one
 * case the header justifies; see the test that asserts the list.
 */
export const QUIET_HOURS_EXEMPT_KINDS = ['voucher_issued'] as const

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: QUIET_HOURS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

interface LocalClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** The wall clock in Israel at a given instant. */
export function israelClock(now: Date): LocalClock {
  const clock: Partial<LocalClock> = {}
  for (const part of PARTS.formatToParts(now)) {
    if (part.type === 'literal') continue
    clock[part.type as keyof LocalClock] = Number(part.value)
  }
  return clock as LocalClock
}

/**
 * Milliseconds Israel is ahead of UTC at a given instant. 7_200_000 in winter,
 * 10_800_000 in summer, and whatever the law says next year.
 */
function israelOffsetMs(at: Date): number {
  const c = israelClock(at)
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second)
  // Drop the sub-second part, which formatToParts does not carry.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/**
 * The UTC instant of a given Israel wall-clock time.
 *
 * Two passes: the offset is read at the naive guess, and then re-read at the
 * answer, because the guess can sit on the other side of a DST change from
 * the answer. On the one night a year when 08:00 does not exist or exists
 * twice, the second pass picks the instant the clock actually reads 08:00
 * after the change, which is the one a person would mean.
 */
export function israelLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0)
  const first = naive - israelOffsetMs(new Date(naive))
  const second = naive - israelOffsetMs(new Date(first))
  return new Date(second)
}

/** Whether the Israel wall clock at this instant is inside the window. */
export function isQuietHour(now: Date): boolean {
  const { hour } = israelClock(now)
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END
}

/**
 * When the window that contains `now` closes: 08:00 Israel time, today if it
 * is before 08:00, tomorrow if it is after 22:00. Undefined for an instant
 * outside the window, and asserted so a caller cannot defer a daytime push.
 */
export function quietHoursEnd(now: Date): Date {
  const c = israelClock(now)
  if (!isQuietHour(now)) {
    throw new Error(`quietHoursEnd called outside the window at ${now.toISOString()}`)
  }
  // Date.UTC normalises an overflowed day (the 32nd of a month, 29 Feb in a
  // common year) into the next month, which is exactly what "tomorrow" means.
  const dayOffset = c.hour >= QUIET_HOURS_START ? 1 : 0
  return israelLocalToUtc(c.year, c.month, c.day + dayOffset, QUIET_HOURS_END)
}

export function isQuietHoursExempt(kind: string): boolean {
  return (QUIET_HOURS_EXEMPT_KINDS as readonly string[]).includes(kind)
}

/**
 * The one question the drain asks: may this push go now, and if not, when?
 *
 * Returns `null` for "send it", and the release instant otherwise.
 */
export function deferForQuietHours(kind: string, now: Date): Date | null {
  if (isQuietHoursExempt(kind)) return null
  if (!isQuietHour(now)) return null
  return quietHoursEnd(now)
}

/** The Hebrew the account page uses to describe the rule. One sentence. */
export const QUIET_HOURS_COPY_HE = 'בין 22:00 ל-08:00 ההתראות ממתינות ונשלחות בבוקר.'
