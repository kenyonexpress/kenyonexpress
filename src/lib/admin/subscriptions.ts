import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The subscription console's read.
 *
 * WHAT [90] WAS MISSING. `135b` is applied, the charge cron is real, the
 * customer page exists - and there was no admin route at all. A recurring
 * billing feature with no operator view means a `past_due` subscription is
 * invisible until the customer complains, which is the case the dunning window
 * exists to catch early.
 *
 * `past_due` FIRST, then `active`, is the order this returns in. An operator
 * opening this page is almost always here because something failed, and a list
 * sorted by creation date buries the three rows that need them under fifty that
 * do not.
 */

export type AdminSubscriptionRow = {
  id: string
  status: string
  amountAgorot: number
  billingInterval: string
  billingIntervalCount: number
  nextChargeAt: string | null
  lastChargeAt: string | null
  failedAttempts: number
  canceledAt: string | null
  cancelReason: string | null
  createdAt: string
  /** True once the dunning window is spent: no run will charge it again. */
  exhausted: boolean
}

export type AdminSubscriptions = {
  rows: AdminSubscriptionRow[]
  applied: boolean
  counts: { active: number; pastDue: number; paused: number; canceled: number; exhausted: number }
}

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

/** Kept in step with `MAX_CHARGE_ATTEMPTS` by the test beside this module. */
const MAX_ATTEMPTS = 3

const EMPTY: AdminSubscriptions = {
  rows: [],
  applied: false,
  counts: { active: 0, pastDue: 0, paused: 0, canceled: 0, exhausted: 0 },
}

/** The order an operator wants: what is broken, then what is running. */
const STATUS_RANK: Record<string, number> = { past_due: 0, active: 1, paused: 2, canceled: 3 }

export async function listSubscriptionsForAdmin(): Promise<AdminSubscriptions> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('subscriptions' as never)
    .select(
      'id, status, amount_agorot, billing_interval, billing_interval_count, next_charge_at, last_charge_at, failed_attempts, canceled_at, cancel_reason, created_at',
    )
    .limit(500)

  if (error) {
    if (!MISSING.has(error.code ?? '')) {
      log.error('admin.subscriptions_read_failed', { reason: error.message })
    }
    return EMPTY
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    status: String(row.status),
    amountAgorot: Number(row.amount_agorot ?? 0),
    billingInterval: String(row.billing_interval ?? ''),
    billingIntervalCount: Number(row.billing_interval_count ?? 1),
    nextChargeAt: (row.next_charge_at as string | null) ?? null,
    lastChargeAt: (row.last_charge_at as string | null) ?? null,
    failedAttempts: Number(row.failed_attempts ?? 0),
    canceledAt: (row.canceled_at as string | null) ?? null,
    cancelReason: (row.cancel_reason as string | null) ?? null,
    createdAt: String(row.created_at),
    exhausted: Number(row.failed_attempts ?? 0) >= MAX_ATTEMPTS,
  }))

  rows.sort((a, b) => {
    const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
    if (rank !== 0) return rank
    // Within a status, the one that is due soonest first: that is the one an
    // operator can still act on.
    const at = a.nextChargeAt ? new Date(a.nextChargeAt).getTime() : Number.MAX_SAFE_INTEGER
    const bt = b.nextChargeAt ? new Date(b.nextChargeAt).getTime() : Number.MAX_SAFE_INTEGER
    return at - bt
  })

  const counts = {
    active: rows.filter((r) => r.status === 'active').length,
    pastDue: rows.filter((r) => r.status === 'past_due').length,
    paused: rows.filter((r) => r.status === 'paused').length,
    canceled: rows.filter((r) => r.status === 'canceled').length,
    exhausted: rows.filter((r) => r.exhausted && r.status !== 'canceled').length,
  }

  return { rows, applied: true, counts }
}
