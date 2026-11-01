import { type UserRole, isAdminRole } from '@/lib/admin/roles'

/**
 * Pure decisions for banning and unbanning an account. No IO: the action
 * layer feeds it the caller and the target it has already read.
 *
 * The lock lives in `auth.users.banned_until`, set through the Auth admin
 * API's `ban_duration`. GoTrue refuses a banned user's token refresh and its
 * /user endpoint, and `proxy.ts` calls `auth.getUser()` on every request, so
 * an existing session dies on its next page load. `profiles.banned_at` and
 * friends (migration 237) are the panel's RECORD of the ban, not the lock.
 */

/**
 * What the Auth admin API is told. Go duration syntax; the largest unit it
 * parses is hours, and 100 years is "indefinitely" for every practical
 * purpose while staying inside the range GoTrue accepts. 'none' lifts a ban.
 */
export const BAN_DURATION_INDEFINITE = '876000h'
export const BAN_DURATION_NONE = 'none'

export const BAN_REASON_MAX = 500

export type BanRecord = {
  banned_at: string | null
  ban_reason: string | null
  banned_by: string | null
}

export type BanAuthzInput = {
  callerId: string
  callerRole: UserRole | null | undefined
  targetUserId: string
  targetRole: UserRole | null | undefined
  action: 'ban' | 'unban'
}

export type BanAuthzResult = { ok: true } | { ok: false; error: string }

/**
 * Who may ban whom.
 *
 *   - Only the admin tier bans at all (support and read_only never write).
 *   - Nobody bans themselves: the lock would take effect on the very next
 *     request and there would be no one left in the room to lift it.
 *   - An admin-tier target is super_admin territory, the same ladder the
 *     role change uses, because a ban is a stronger revocation than a
 *     demotion and must not be reachable by a weaker caller.
 *
 * Unban follows the same matrix: whoever could have set the ban may lift it.
 */
export function authorizeBan(input: BanAuthzInput): BanAuthzResult {
  if (!isAdminRole(input.callerRole)) {
    return { ok: false, error: 'אין הרשאה' }
  }
  if (input.targetUserId === input.callerId) {
    return {
      ok: false,
      error: input.action === 'ban' ? 'אי אפשר לחסום את עצמך' : 'אי אפשר לשנות את החסימה של עצמך',
    }
  }
  if (isAdminRole(input.targetRole) && input.callerRole !== 'super_admin') {
    return { ok: false, error: 'רק מנהל-על יכול לחסום או לשחרר מנהל' }
  }
  return { ok: true }
}

export function isBanned(record: Pick<BanRecord, 'banned_at'> | null | undefined): boolean {
  return Boolean(record?.banned_at)
}

/**
 * The reason as it goes into the row: trimmed, capped, and never an empty
 * string (NULL is "no reason given", '' would render as a blank line).
 */
export function normalizeBanReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.length > BAN_REASON_MAX ? trimmed.slice(0, BAN_REASON_MAX) : trimmed
}
