/**
 * Banning a user: the decision, without the auth call.
 *
 * A ban is written to `auth.users.banned_until` through the Auth admin API,
 * not to `profiles`. That is the one place the platform checks on every
 * server-side session read: GoTrue refuses a banned user's token in
 * `maybeLoadUserOrSession`, so `supabase.auth.getUser()` fails and every
 * guard in `lib/admin/rbac.ts` and `lib/supabase/server.ts` sends them to
 * login. A flag on `profiles` would have needed a check in each of those.
 *
 * Who may ban whom mirrors role changes: nobody bans themself, and an admin
 * cannot ban another admin unless they are super_admin.
 */

import type { AppRole } from './roles'
import { isAdminRole } from './roles'

/** A hundred years: "until further notice" in a duration GoTrue accepts. */
export const BAN_INDEFINITE = '876000h'
export const BAN_MIN_REASON = 5
export const BAN_MAX_REASON = 300

export type BanDecision = { ok: true } | { ok: false; error: string }

export function authorizeBan(params: {
  callerId: string
  callerRole: AppRole
  targetUserId: string
  targetRole: AppRole | null
}): BanDecision {
  if (params.targetUserId === params.callerId) {
    return { ok: false, error: 'אי אפשר לחסום את עצמך' }
  }
  if (isAdminRole(params.targetRole ?? 'customer') && params.callerRole !== 'super_admin') {
    return { ok: false, error: 'רק מנהל-על יכול לחסום מנהל' }
  }
  return { ok: true }
}

/** True when `banned_until` is set and in the future. */
export function isBanned(bannedUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!bannedUntil) return false
  const until = new Date(bannedUntil).getTime()
  return Number.isFinite(until) && until > now.getTime()
}

export function readBanReason(raw: unknown): string | null {
  const reason = String(raw ?? '')
    .trim()
    .slice(0, BAN_MAX_REASON)
  return reason.length >= BAN_MIN_REASON ? reason : null
}
