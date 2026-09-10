import { createHash } from 'node:crypto'

/**
 * A REFUSAL WAS THE ONE THING THIS LAYER DID NOT RECORD.
 *
 * MEASURED 2026-09-10: every log line in `src/lib/rate-limit/` is about the
 * limiter FAILING - `rate_limit.upstash_failed`, `rate_limit.upstash_unreadable`,
 * `rate_limit.admin_client_unavailable`, `rate_limit.open`. Not one of them fires
 * when a caller is actually refused. So "how many customers hit the checkout
 * ceiling today" had no answer, and a ceiling set too tight was invisible until
 * somebody phoned: `phone-otp` allows 5 an hour per IP and `begin_checkout` 10 a
 * minute, and an office behind one address or a shopper retrying a declined card
 * reaches both without doing anything wrong.
 *
 * ONE LINE PER KEY PER WINDOW, NOT ONE PER REQUEST. Once a caller is over the
 * ceiling every subsequent request is refused too, so logging each one turns a
 * bot into a log flood and buries the signal it was added for. The dedupe below
 * reports the FIRST refusal in a window and stays quiet for the rest of it.
 *
 * PER PROCESS, and stated rather than implied: this is a Map in a serverless
 * runtime, so each warm instance reports its own first refusal. That is enough
 * for the question being asked - which ceilings are being hit at all - and it is
 * not a counter. `RateLimit-Remaining` is the counter, and it goes to the caller.
 *
 * THE IDENTIFIER IS HASHED, ALWAYS. A rate-limit key carries whatever the caller
 * was keyed on, which for `phone-otp-number` is a phone number and for the IP
 * policies is an IP address. Both are personal data and the scrubber that
 * protects logs works on FIELD NAMES, so a phone number inside a string called
 * `key` would go straight through it. Only the policy name is logged in the
 * clear; the identifier is a 12-character SHA-256 prefix, which is enough to see
 * that one caller is responsible for a thousand refusals and useless for
 * learning who they are.
 */

/** How many (key, window) pairs to remember before evicting the oldest. */
const MEMORY = 500

const reported = new Map<string, number>()

/** `rl:v1:phone-otp:+972...` -> `phone-otp`. Unknown shapes answer null. */
export function policyFromKey(key: string): string | null {
  const withoutPrefix = key.startsWith('rl:v1:') ? key.slice('rl:v1:'.length) : key
  const name = withoutPrefix.split(':')[0]
  return name && name.length > 0 ? name : null
}

/** A 12-hex-character fingerprint of the identifier. Never reversible here. */
export function identifierFingerprint(key: string): string {
  const policy = policyFromKey(key)
  const withoutPrefix = key.startsWith('rl:v1:') ? key.slice('rl:v1:'.length) : key
  const identifier = policy ? withoutPrefix.slice(policy.length + 1) : withoutPrefix
  return createHash('sha256').update(identifier).digest('hex').slice(0, 12)
}

/**
 * True the first time this key is refused in this window, false afterwards.
 *
 * `resetAtMs` is the window boundary when Upstash answered and null when the
 * Postgres fallback did - it returns one boolean and no counter. Without it the
 * window is bucketed from the clock, which is coarser and still bounded: one line
 * per key per window length rather than one per request.
 */
export function shouldReportRejection(
  key: string,
  resetAtMs: number | null,
  windowSeconds: number,
  nowMs: number,
): boolean {
  const window = resetAtMs ?? Math.floor(nowMs / (windowSeconds * 1000)) * windowSeconds * 1000
  const previous = reported.get(key)
  if (previous === window) return false

  reported.set(key, window)
  if (reported.size > MEMORY) {
    // Insertion order, so the first key is the oldest. Evicting one per write
    // keeps the map bounded without a sweep.
    const oldest = reported.keys().next().value
    if (oldest !== undefined) reported.delete(oldest)
  }
  return true
}

/** Exported for tests: module state is otherwise unreachable between cases. */
export function __resetRejectionMemory(): void {
  reported.clear()
}
