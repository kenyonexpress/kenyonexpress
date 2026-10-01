import {
  type RedemptionVelocityCounts,
  checkRedemptionVelocity,
} from '@/lib/fraud/redemption-velocity'
import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Reads the two counts `checkRedemptionVelocity` needs out of
 * `voucher_redemptions`, which is append-only (RLS on the table grants
 * `anon`/`authenticated` no INSERT/UPDATE/DELETE policy at all; every row
 * reaching it comes from `redeem_voucher` or `log_voucher_scan`, both
 * SECURITY DEFINER) and has carried `ip_address` since 085 - already live in
 * production, unlike `order_risk_assessments` (202, pending), so this needs
 * no migration to start working.
 */
type Client = ReturnType<typeof createAdminClient>

const HOUR_MS = 60 * 60 * 1000

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

async function readCounts(
  client: Client,
  args: { userId: string; ip: string | null; since: string },
): Promise<RedemptionVelocityCounts> {
  const [byIp, byUser] = await Promise.all([
    args.ip
      ? client
          .from('voucher_redemptions')
          .select('scanned_by')
          .eq('ip_address', args.ip)
          .gte('created_at', args.since)
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    client
      .from('voucher_redemptions')
      .select('outcome')
      .eq('scanned_by', args.userId)
      .gte('created_at', args.since)
      .limit(500),
  ])

  if (byIp.error) {
    log.warn('fraud.redemption_ip_read_failed', { reason: byIp.error.message })
  }
  if (byUser.error) {
    log.warn('fraud.redemption_user_read_failed', { reason: byUser.error.message })
  }

  const ipRows = rows<{ scanned_by: string | null }>(byIp.data)
  const userRows = rows<{ outcome: string }>(byUser.data)

  const distinctAccounts = new Set(
    ipRows
      .map((row) => row.scanned_by)
      .filter((value): value is string => typeof value === 'string'),
  )

  return {
    accountsFromIpLastHour: args.ip ? distinctAccounts.size : 0,
    attemptsFromIpLastHour: args.ip ? ipRows.length : 0,
    failedOutcomesLastHour: userRows.filter((row) => row.outcome !== 'success').length,
  }
}

/**
 * Logs when a redemption's surrounding traffic crosses one of the velocity
 * ceilings. NEVER THROWS and NEVER CHANGES THE RESPONSE: this runs after the
 * RPC has already decided the outcome, purely to give an operator something
 * to search for. A read that fails is reported at zero rather than thrown,
 * the same choice `server/fraud/signals.ts` makes for the checkout layer and
 * for the same reason - losing a signal costs a signal, and this sits behind
 * a scan a customer is waiting on.
 */
export async function recordRedemptionSignals(
  client: Client,
  args: { userId: string; ip: string | null; now: Date },
): Promise<void> {
  try {
    const since = new Date(args.now.getTime() - HOUR_MS).toISOString()
    const counts = await readCounts(client, { userId: args.userId, ip: args.ip, since })
    const flags = checkRedemptionVelocity(counts)
    if (flags.length > 0) {
      log.warn('fraud.redemption_velocity_flagged', {
        userId: args.userId,
        ip: args.ip,
        flags,
        counts,
      })
    }
  } catch (error) {
    log.warn('fraud.redemption_signals_unavailable', {
      userId: args.userId,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}
