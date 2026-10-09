import { rateLimit } from '@/lib/rate-limit/limiter'

/**
 * Order-velocity limits, one bucket per identity DIMENSION rather than one per
 * caller. `begin_checkout` (10 a minute, per user id) bounds a stuck retry
 * loop; these bound a fraud run, which does not look like one user id. A
 * carding run rotates cards and accounts but keeps the address it ships to and
 * the phone the courier calls, so the phone and the IP are the identities
 * worth counting, and the windows are a day, not a minute.
 *
 * The buckets are spent AFTER the idempotent-replay short-circuit in
 * beginCheckout: a shopper whose card declines retries the same client_ref and
 * is answered from the replay lookup, so a struggling honest payer does not
 * burn their daily allowance on one stubborn order.
 *
 * Inherits the limiter's failure posture: a limiter outage fails open and says
 * so loudly. Velocity is a defence against abuse, not a component checkout
 * should die with.
 */

export type VelocityDimension = 'ip' | 'email' | 'phone'

export type VelocityIdentity = {
  /** Null when unknown; a missing dimension is skipped, never counted as 'null'. */
  ip: string | null
  email: string | null
  phone: string | null
}

export type VelocityDecision = { ok: true } | { ok: false; dimension: VelocityDimension }

/**
 * One casing, one bucket. Without this, Gmail's own display tricks
 * (`Ofir@`, `ofir@`) would each get a fresh allowance.
 */
export function normalizeVelocityEmail(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

/**
 * Digits only, and the international prefix folded into the local form:
 * `+972 50-123-4567` and `050-1234567` are the same courier call, and a
 * limit the attacker resets by reformatting the number is not a limit.
 */
export function normalizeVelocityPhone(raw: string | null | undefined): string | null {
  const digits = raw?.replace(/\D/g, '') ?? ''
  if (!digits) return null
  if (digits.startsWith('972') && digits.length >= 11) return `0${digits.slice(3)}`
  return digits
}

/**
 * Spends the applicable buckets in a fixed order (ip, email, phone) and stops
 * at the first refusal, so a blocked IP does not also spend the email and
 * phone allowances of whoever it was impersonating.
 *
 * Three literal calls rather than a loop over a template string, because the
 * policies static audit reads policy names off `rateLimit('...')` call sites,
 * and a computed name would make all three rows look orphaned.
 */
export async function checkCheckoutVelocity(
  identity: VelocityIdentity,
  options: { nowMs?: number } = {},
): Promise<VelocityDecision> {
  const opts = { nowMs: options.nowMs }

  if (identity.ip) {
    const decision = await rateLimit('checkout-velocity-ip', identity.ip, opts)
    if (!decision.allowed) return { ok: false, dimension: 'ip' }
  }
  if (identity.email) {
    const decision = await rateLimit('checkout-velocity-email', identity.email, opts)
    if (!decision.allowed) return { ok: false, dimension: 'email' }
  }
  if (identity.phone) {
    const decision = await rateLimit('checkout-velocity-phone', identity.phone, opts)
    if (!decision.allowed) return { ok: false, dimension: 'phone' }
  }

  return { ok: true }
}
