/**
 * Forced re-authentication for payment-method changes (STEP 18).
 *
 * Supabase stamps every session with `amr`, the list of authentication
 * methods it has proven and WHEN (unix seconds). Deleting a saved card or
 * changing the default one must happen inside a short window after one of
 * those proofs, so a session left open on a shared machine, or a stolen
 * cookie, cannot re-point the customer's default card. A passkey glance, a
 * magic-link click, a password or an OTP all count: the requirement is
 * "the person is here now", not a particular factor.
 *
 * Pure: the caller passes the methods and the clock.
 */

export interface AuthMethodEntry {
  method: string
  /** Unix seconds, as GoTrue reports it. */
  timestamp: number
}

/** Ten minutes: long enough to find the card, short enough to bound a walk-away. */
export const RECENT_AUTH_MAX_AGE_MS = 10 * 60_000

export type RecentAuthDecision =
  | { recent: true; ageMs: number }
  | { recent: false; reason: 'no_methods' | 'stale'; ageMs: number | null }

export function decideRecentAuth(
  methods: readonly AuthMethodEntry[] | null | undefined,
  now: number = Date.now(),
  maxAgeMs: number = RECENT_AUTH_MAX_AGE_MS,
): RecentAuthDecision {
  const stamps = (methods ?? []).map((m) => m.timestamp).filter((t) => Number.isFinite(t) && t > 0)
  if (stamps.length === 0) return { recent: false, reason: 'no_methods', ageMs: null }
  const latestMs = Math.max(...stamps) * 1000
  const ageMs = Math.max(0, now - latestMs)
  if (ageMs > maxAgeMs) return { recent: false, reason: 'stale', ageMs }
  return { recent: true, ageMs }
}

/**
 * The one message the account page matches on to show the re-login link;
 * exported from here (no server imports) so the client component can compare.
 */
export const REAUTH_REQUIRED_MESSAGE = 'לאבטחתך, יש להתחבר מחדש לפני שינוי אמצעי תשלום'

export function reauthLoginHref(next: string): string {
  return `/login?reauth=1&next=${encodeURIComponent(next)}`
}
