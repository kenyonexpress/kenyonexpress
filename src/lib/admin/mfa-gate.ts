import type { AppRole } from '@/lib/admin/roles'

/**
 * Staff roles that must hold an MFA-verified session (aal2) before any admin
 * guard passes, and must enrol a TOTP factor if they have none.
 *
 * Until G6 (05.11.2026) only super_admin was forced; admin and
 * content_uploader passed at aal1 and were merely nudged. G6 forces all three:
 * every one of them can publish products and move money, and a session that
 * is a password away from that is the gap the queue item closes. support and
 * read_only stay on aal1: they read, they do not write.
 *
 * Inputs, straight from `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`:
 *   currentLevel  what this session proved ('aal2' after a TOTP verify)
 *   nextLevel     what the account could prove ('aal2' iff a verified
 *                 factor exists)
 *
 * Decisions:
 *   'ok'         pass
 *   'challenge'  a verified factor exists, this session has not used it
 *   'enrol'      no verified factor: set one up first
 *
 * A null level (call failed, claim missing) is treated as aal1: for the roles
 * this gate exists for, failing open would be the vulnerability.
 *
 * LOCKOUT IS NOT POSSIBLE FROM HERE, and that is why forcing is safe to ship:
 * 'enrol' sends the person to /admin-mfa, where the ceremony needs nothing
 * but the signed-in session they already have. Losing the authenticator later
 * is what backup codes (`lib/auth/backup-codes.ts`) are for.
 */
export type AssuranceLevel = 'aal1' | 'aal2' | null

export type MfaGateDecision = 'ok' | 'enrol' | 'challenge'

export const MFA_FORCED_ROLES: readonly AppRole[] = ['super_admin', 'admin', 'content_uploader']

export function isMfaForcedRole(role: AppRole | null | undefined): boolean {
  return role != null && MFA_FORCED_ROLES.includes(role)
}

export function staffMfaGate(
  role: AppRole | null | undefined,
  currentLevel: AssuranceLevel,
  nextLevel: AssuranceLevel,
): MfaGateDecision {
  if (!isMfaForcedRole(role)) return 'ok'
  if (currentLevel === 'aal2') return 'ok'
  return nextLevel === 'aal2' ? 'challenge' : 'enrol'
}

/** @deprecated G6: the gate forces three roles now; kept so older call sites type-check. */
export const superAdminMfaGate = staffMfaGate
