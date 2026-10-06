import { type MessageKey, t } from '@/lib/i18n/messages'

/**
 * How long a coupon can still be used, as something a customer can read.
 *
 * PURE, and clock-free: the caller passes `now`, so the same function serves
 * the browser tick and a table test. The deadline it counts to is
 * `vouchers.expires_at`, the effective date the counter refuses after, and
 * never `offer_valid_until` (see `coupon-view.ts` for why those two differ).
 *
 * THE LABEL IS BUILT FROM THE CATALOG, with `{days}`-style slots filled here,
 * because `t()` has no interpolation on purpose: one locale is compiled in and
 * the function is a property lookup. A sentence with numbers in it is therefore
 * a template in `messages/*.json` plus `fillTemplate`, not a Hebrew literal
 * concatenated in a component, which is what the i18n ratchet counts.
 *
 * A PASSED DEADLINE IS `null`, never a negative part. The expired state reads
 * `פג תוקף`, the same word `couponStatusView` uses, so the chip and the counter
 * cannot disagree about whether the coupon is still alive.
 */

export interface ValidityParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** The remaining time, floored to whole seconds, or null once the deadline has passed. */
export function validityRemaining(
  expiresAt: string | number | Date,
  now: number | Date,
): ValidityParts | null {
  const deadline = new Date(expiresAt).getTime()
  const at = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(deadline) || !Number.isFinite(at)) return null
  const ms = deadline - at
  if (ms <= 0) return null
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

/** `{name}` slots replaced with their values; an unknown slot is left as written. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

/**
 * The granularity steps down as the deadline approaches: days and hours while
 * there is at least a day, hours and minutes inside the last day, minutes and
 * seconds inside the last hour. A counter that reads "0 ימים ו-3 שעות" is
 * counting the wrong unit.
 */
export function validityLabel(parts: ValidityParts | null): string {
  if (parts === null) return t('validity.expired')
  let key: MessageKey
  if (parts.days > 0) key = 'validity.daysHours'
  else if (parts.hours > 0) key = 'validity.hoursMinutes'
  else key = 'validity.minutesSeconds'
  return fillTemplate(t(key), { ...parts })
}

/** How often the browser should recompute: once a minute until the last hour, then every second. */
export function validityTickMs(parts: ValidityParts | null): number {
  if (parts === null) return 60_000
  return parts.days === 0 && parts.hours === 0 ? 1000 : 60_000
}
