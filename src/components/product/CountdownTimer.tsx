'use client'

import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * The deal countdown on a coupon product page.
 *
 * WHAT IT COUNTS. `products.offer_valid_until` only, which is a `timestamptz`
 * and therefore arrives here as a UTC instant. Both sides of the subtraction
 * are epoch milliseconds, so the shopper's device timezone never enters the
 * arithmetic and a phone set to New York sees the same remaining time as one
 * set to Jerusalem. There is deliberately no rolling "offer ends in 2 hours"
 * timer: Israeli consumer law limits an urgency claim to one the seller can
 * substantiate, and the only thing this seller can substantiate is the date an
 * admin actually put on the offer.
 *
 * WHY IT RENDERS NOTHING ON THE SERVER. The product page is `'use cache'` for
 * an hour (`lib/product-detail.ts`), so anything the server computed from the
 * clock would be served up to an hour stale and would disagree with the first
 * client tick -- a hydration mismatch on a number the whole point of which is
 * to be exact. The first paint is therefore empty and the value appears on
 * mount. That is one frame of nothing on a decorative line, against a wrong
 * number on a legal claim.
 */

/** Above this many days the deadline is not news, so the timer stays hidden. */
export const COUNTDOWN_VISIBLE_DAYS = 7
/** Below this many hours the timer turns red. */
export const COUNTDOWN_URGENT_HOURS = 24

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export type CountdownState =
  /** Further out than COUNTDOWN_VISIBLE_DAYS, or no deadline at all. */
  | { kind: 'hidden' }
  /**
   * The deadline has passed. Also renders nothing: the pricing block above
   * already says "המבצע הסתיים" from the same column, and two components
   * announcing the same end reads as a bug.
   */
  | { kind: 'ended' }
  | { kind: 'live'; days: number; hours: number; minutes: number; urgent: boolean }

/**
 * Pure, and exported for the tests: every branch here is a claim made to a
 * customer about a deadline, so each one is asserted rather than eyeballed.
 */
export function countdownState(
  target: Date | string | null | undefined,
  now: number,
): CountdownState {
  if (!target) return { kind: 'hidden' }
  const endsAt = target instanceof Date ? target.getTime() : new Date(target).getTime()
  if (Number.isNaN(endsAt)) return { kind: 'hidden' }

  const remaining = endsAt - now
  if (remaining <= 0) return { kind: 'ended' }
  if (remaining > COUNTDOWN_VISIBLE_DAYS * DAY_MS) return { kind: 'hidden' }

  return {
    kind: 'live',
    days: Math.floor(remaining / DAY_MS),
    hours: Math.floor((remaining % DAY_MS) / HOUR_MS),
    minutes: Math.floor((remaining % HOUR_MS) / MINUTE_MS),
    urgent: remaining < COUNTDOWN_URGENT_HOURS * HOUR_MS,
  }
}

/** Hebrew counts the first two of anything specially: יום / יומיים / 3 ימים. */
function hebrewCount(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one
  if (n === 2) return two
  return `${n} ${many}`
}

/** The sentence under the badge, e.g. "נותרו 3 ימים ו-5 שעות". */
export function countdownLabel(state: CountdownState): string | null {
  if (state.kind !== 'live') return null

  // Under a day the interesting unit is minutes; above it, hours. Showing all
  // three at once is how a countdown stops being read at a glance.
  const parts = state.urgent
    ? [
        state.hours > 0 ? hebrewCount(state.hours, 'שעה', 'שעתיים', 'שעות') : null,
        hebrewCount(state.minutes, 'דקה', 'שתי דקות', 'דקות'),
      ]
    : [
        hebrewCount(state.days, 'יום', 'יומיים', 'ימים'),
        state.hours > 0 ? hebrewCount(state.hours, 'שעה', 'שעתיים', 'שעות') : null,
      ]

  // The conjunction is written `ו-5 שעות` before a numeral and `ושעתיים`
  // before a word. One joiner cannot serve both, and `ו-שעתיים` is the kind of
  // detail a Hebrew reader notices immediately.
  const text = parts
    .filter((part): part is string => part !== null)
    .reduce(
      (acc, part) => (acc === '' ? part : `${acc} ו${/^\d/.test(part) ? '-' : ''}${part}`),
      '',
    )
  return `נותרו ${text}`
}

export default function CountdownTimer({
  validUntil,
  className = '',
}: {
  /** `products.offer_valid_until`, serialised as an ISO UTC string. */
  validUntil: string | null | undefined
  className?: string
}) {
  const [state, setState] = useState<CountdownState>({ kind: 'hidden' })

  useEffect(() => {
    const tick = () => setState(countdownState(validUntil, Date.now()))
    tick()

    // A minute is the resolution of the non-urgent line, so ticking faster
    // than that only spends battery. Inside the last day the minutes are
    // visible and a stale one is the whole failure mode.
    const id = setInterval(tick, MINUTE_MS)
    return () => clearInterval(id)
  }, [validUntil])

  const label = countdownLabel(state)
  if (!label) return null

  const urgent = state.kind === 'live' && state.urgent

  return (
    <p
      // `role="timer"` without `aria-live`: the value changes every minute, and
      // announcing that to a screen reader on every tick talks over the page.
      // The label carries the same sentence sighted users read.
      role="timer"
      aria-label={`${urgent ? 'המבצע מסתיים בקרוב. ' : ''}${label}`}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
        urgent ? 'bg-[#e4002b]/10 text-[#e4002b]' : 'bg-surface-hover text-heading'
      } ${className}`}
    >
      <Clock size={16} aria-hidden="true" className={urgent ? 'animate-pulse' : undefined} />
      <span>{label}</span>
    </p>
  )
}
