import { type UserRole, isAdminRole } from '@/lib/admin/roles'

// The admin tier (admin and super_admin) must hold an MFA-verified session
// (aal2) before any admin guard lets them through; everyone else passes
// untouched. Pure so the decision table is unit-testable; rbac.ts owns the
// IO and the redirect.
//
// Until STEP 19 only super_admin was gated. The panel is where every product,
// price and refund is written, and a password alone is a phishing away from
// all of it, so the requirement now covers the whole tier. The panel roles
// below the tier (content_uploader, support, read_only) are not gated here:
// they cannot write money or roles, and enrolment stays available to them on
// /account/security.
//
// Levels come from supabase.auth.mfa.getAuthenticatorAssuranceLevel():
//   currentLevel  what this session proved ('aal2' after a TOTP verify)
//   nextLevel     what the account could prove ('aal2' iff a verified
//                 factor is enrolled)
//
// The two non-ok outcomes map to the two halves of "MFA required":
//   'enrol'     no verified factor exists; the account must set one up
//   'challenge' a factor exists; this session has not verified it yet
//
// A null level (call failed, claim missing) is treated as aal1: for the
// roles this gate exists for, failing open would be the vulnerability.

export type AssuranceLevel = 'aal1' | 'aal2' | null

export type MfaGateDecision = 'ok' | 'enrol' | 'challenge'

export function adminMfaGate(
  role: UserRole | null | undefined,
  currentLevel: AssuranceLevel,
  nextLevel: AssuranceLevel,
): MfaGateDecision {
  if (!isAdminRole(role)) return 'ok'
  if (currentLevel === 'aal2') return 'ok'
  return nextLevel === 'aal2' ? 'challenge' : 'enrol'
}

/** True for the roles the gate applies to. One name for the page and the guard. */
export function isMfaRequiredRole(role: UserRole | null | undefined): boolean {
  return isAdminRole(role)
}
