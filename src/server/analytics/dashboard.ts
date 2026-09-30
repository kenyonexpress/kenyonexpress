import { log } from '@/lib/observability/log'
import 'server-only'

import type {
  CashbackWalletRow,
  CouponCodeStat,
  CouponStatus,
  FunnelEvent,
  OrderStat,
  OrderStatus,
} from '@/lib/analytics/dashboard-kpis'
import { ilsToAgorot } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { windowStart } from './queries'

// Row loading for the four non-sales panels of the admin analytics page.
//
// Same shape as queries.ts: one indexed read per panel, mapping only, and the
// arithmetic in lib/analytics/dashboard-kpis.ts where it is unit-tested.
//
// Every loader returns `{ ok: false, reason }` on a failed read and the page
// prints that, because a dashboard that renders zeros when the database did
// not answer is reporting a quiet day that did not happen. Nothing here throws:
// the page has five independent panels and one failing must not blank the rest.

const MAX_ROWS = 20_000

export type Loaded<T> = { ok: true; value: T; truncated: boolean } | { ok: false; reason: string }

function failed<T>(event: string, reason: string): Loaded<T> {
  log.error(event, { reason })
  return { ok: false, reason }
}

/**
 * The agorot column when present, else the legacy numeric mirror converted
 * once at the boundary. Rows written before the agorot columns existed have
 * only the mirror; rows written since have both and they agree.
 */
export function agorotFromPair(agorotValue: number | null, ilsValue: number | string): number {
  if (agorotValue !== null && Number.isInteger(agorotValue)) return agorotValue
  return ilsToAgorot(ilsValue)
}

// ---------------------------------------------------------------------------

export async function loadCouponCodes(days: number): Promise<Loaded<CouponCodeStat[]>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('coupon_codes')
    .select('status, created_at, redeemed_at, expires_at')
    .gte('created_at', windowStart(days))
    .limit(MAX_ROWS)

  if (error || !data) {
    return failed('analytics.coupon_codes_failed', error?.message ?? 'no data')
  }

  return {
    ok: true,
    truncated: data.length >= MAX_ROWS,
    value: data.map((row) => ({
      status: row.status as CouponStatus,
      createdAt: row.created_at,
      redeemedAt: row.redeemed_at,
      expiresAt: row.expires_at,
    })),
  }
}

// ---------------------------------------------------------------------------

export async function loadCashbackWallets(): Promise<Loaded<CashbackWalletRow[]>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('wallet_balances')
    .select('balance_ils, balance_ils_agorot, lifetime_earned_ils, lifetime_redeemed_ils')
    .is('deleted_at', null)
    .limit(MAX_ROWS)

  if (error || !data) {
    return failed('analytics.cashback_wallets_failed', error?.message ?? 'no data')
  }

  // The columns are numeric(12,2), so the conversion cannot fail on a row the
  // database accepted; if it ever does, that is a malformed value and the
  // panel says so instead of adding up the rows around it.
  try {
    return {
      ok: true,
      truncated: data.length >= MAX_ROWS,
      value: data.map((row) => ({
        balanceAgorot: agorotFromPair(row.balance_ils_agorot, row.balance_ils),
        // The lifetime counters have no agorot twin yet; they are read-only
        // history and converted once here.
        lifetimeEarnedAgorot: ilsToAgorot(row.lifetime_earned_ils),
        lifetimeRedeemedAgorot: ilsToAgorot(row.lifetime_redeemed_ils),
      })),
    }
  } catch (cause) {
    return failed(
      'analytics.cashback_wallets_malformed',
      cause instanceof Error ? cause.message : String(cause),
    )
  }
}

// ---------------------------------------------------------------------------

export type SignupLoad = {
  /** created_at of every profile registered inside the window. */
  createdAts: string[]
  /** Profiles registered before the window opened. */
  priorCount: number
}

export async function loadSignups(days: number): Promise<Loaded<SignupLoad>> {
  const admin = createAdminClient()
  const since = windowStart(days)

  const [inWindow, before] = await Promise.all([
    admin.from('profiles').select('created_at').gte('created_at', since).limit(MAX_ROWS),
    admin.from('profiles').select('id', { count: 'exact', head: true }).lt('created_at', since),
  ])

  if (inWindow.error || !inWindow.data) {
    return failed('analytics.signups_failed', inWindow.error?.message ?? 'no data')
  }
  if (before.error || before.count === null) {
    return failed('analytics.signups_prior_count_failed', before.error?.message ?? 'no count')
  }

  return {
    ok: true,
    truncated: inWindow.data.length >= MAX_ROWS,
    value: {
      createdAts: inWindow.data
        .map((row) => row.created_at)
        .filter((iso): iso is string => typeof iso === 'string'),
      priorCount: before.count,
    },
  }
}

// ---------------------------------------------------------------------------

export async function loadOrderStats(days: number): Promise<Loaded<OrderStat[]>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('orders')
    .select('status, paid_at, expires_at')
    .is('deleted_at', null)
    .gte('created_at', windowStart(days))
    .limit(MAX_ROWS)

  if (error || !data) {
    return failed('analytics.order_stats_failed', error?.message ?? 'no data')
  }

  return {
    ok: true,
    truncated: data.length >= MAX_ROWS,
    value: data.map((row) => ({
      status: row.status as OrderStatus,
      paidAt: row.paid_at,
      expiresAt: row.expires_at,
    })),
  }
}

// ---------------------------------------------------------------------------

const FUNNEL_EVENT_NAMES = ['page_view', 'view_product', 'add_to_cart', 'checkout_step'] as const

const MAX_EVENTS = 50_000

export type FunnelEventsLoad = {
  events: FunnelEvent[]
  /** Paid orders in the window, the purchase step of the funnel. */
  purchases: number
}

/**
 * Raw funnel events for the window, for databases without v_funnel_daily. The
 * events table grows fast, so the cap is higher than the others and reported
 * the same way; only the four funnel event names are pulled.
 */
export async function loadFunnelEvents(days: number): Promise<Loaded<FunnelEventsLoad>> {
  const admin = createAdminClient()
  const since = windowStart(days)

  const [events, paid] = await Promise.all([
    admin
      .from('analytics_events')
      .select('session_id, event_name, props')
      .in('event_name', [...FUNNEL_EVENT_NAMES])
      .gte('occurred_at', since)
      .limit(MAX_EVENTS),
    admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', since),
  ])

  if (events.error || !events.data) {
    return failed('analytics.funnel_events_failed', events.error?.message ?? 'no data')
  }
  if (paid.error || paid.count === null) {
    return failed('analytics.funnel_purchases_failed', paid.error?.message ?? 'no count')
  }

  return {
    ok: true,
    truncated: events.data.length >= MAX_EVENTS,
    value: {
      events: events.data.map((row) => ({
        sessionId: row.session_id,
        eventName: row.event_name,
        step: stepOf(row.props),
      })),
      purchases: paid.count,
    },
  }
}

function stepOf(props: unknown): string | null {
  if (props && typeof props === 'object' && 'step' in props) {
    const step = (props as { step: unknown }).step
    return typeof step === 'string' ? step : null
  }
  return null
}
