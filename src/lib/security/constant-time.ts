import { timingSafeEqual } from 'node:crypto'

/**
 * Comparing a caller-supplied secret against the expected one without letting
 * the comparison itself say how much of the guess was right.
 *
 * WHY THIS IS A MODULE AND NOT A LINE IN EACH ROUTE. The Cardcom webhook has
 * used `timingSafeEqual` since it was written, and its comment explains at
 * length why the check must not short circuit. The seven cron routes were
 * written against the same threat and compare with `!==` on a template string.
 * One of the two is wrong, and the disagreement is invisible: both answer 401
 * to a wrong secret and 200 to the right one, so nothing fails and no test
 * catches it.
 *
 * `!==` on strings stops at the first differing byte. That is a measurable
 * signal to a caller who can time the response, and a cron secret is exactly
 * the kind of value worth guessing a byte at a time: it authorises invoice
 * generation, voucher expiry and the abandoned-cart mailer.
 *
 * WHY LENGTH IS ALLOWED TO LEAK. `timingSafeEqual` throws on unequal lengths
 * rather than returning false, so the length check has to happen first and it
 * cannot be constant time. That is the standard trade and it is not the
 * weakness: the length of a secret is not the secret.
 */
export function secretEquals(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * The `Authorization: Bearer <secret>` form every cron route in this app uses.
 *
 * Takes the whole header rather than a pre-stripped token so the prefix is
 * checked in one place. A header that is not Bearer-shaped is rejected before
 * the compare, which is not a timing concern: the scheme is not secret.
 */
export function bearerMatches(header: string | null | undefined, expected: string): boolean {
  if (!header || !expected) return false
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return false
  return secretEquals(header.slice(prefix.length), expected)
}
