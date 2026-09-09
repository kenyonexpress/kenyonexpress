import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * MFA policy on top of Supabase's NATIVE TOTP (auth.mfa.*) -- deliberately
 * not a custom admin_totp table. The auth provider already stores factors,
 * rates challenges, and stamps every session with an assurance level
 * (aal1 = password only, aal2 = password + verified factor). A parallel
 * otplib+AES table would be a second source of truth for the same question,
 * unreadable by the provider that actually issues the sessions.
 *
 * The policy itself is one pure sentence, in decideMfaGate: a staff session
 * whose OWNER has a verified factor must be at aal2 to pass the admin gate.
 * Enrollment stays user-driven (an admin with no factor passes at aal1 and
 * is nudged on /account/security) because mandatory enrollment, shipped from
 * an autonomous run, is how the one human with production access gets locked
 * out of their own panel.
 */

export interface MfaLevels {
  currentLevel: string | null
  nextLevel: string | null
}

export type MfaGate = { pass: true } | { pass: false; reason: 'challenge_required' }

/**
 * Supabase encodes "has a verified factor but this session has not proven it"
 * as nextLevel=aal2 while currentLevel=aal1. That exact state is the only one
 * this gate stops.
 */
export function decideMfaGate(levels: MfaLevels): MfaGate {
  if (levels.nextLevel === 'aal2' && levels.currentLevel !== 'aal2') {
    return { pass: false, reason: 'challenge_required' }
  }
  return { pass: true }
}

/** Reads the session's levels; a read failure gates CLOSED for staff paths. */
export async function readMfaLevels(supabase: SupabaseClient): Promise<MfaLevels | null> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return null
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel }
}
