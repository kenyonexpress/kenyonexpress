import type { AppRole } from '@/lib/admin/roles'

// super_admin must hold an MFA-verified session (aal2) before any admin
// guard lets them through; everyone else passes untouched. Pure so the
// decision table is unit-testable; rbac.ts owns the IO and the redirect.
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
// A null level (call failed, claim missing) is treated as aal1: for the one
// role this gate exists for, failing open would be the vulnerability.

export type AssuranceLevel = 'aal1' | 'aal2' | null

export type MfaGateDecision = 'ok' | 'enrol' | 'challenge'

export function superAdminMfaGate(
  role: AppRole | null | undefined,
  currentLevel: AssuranceLevel,
  nextLevel: AssuranceLevel,
): MfaGateDecision {
  if (role !== 'super_admin') return 'ok'
  if (currentLevel === 'aal2') return 'ok'
  return nextLevel === 'aal2' ? 'challenge' : 'enrol'
}
