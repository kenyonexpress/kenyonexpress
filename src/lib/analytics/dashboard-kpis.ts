import { type Period, periodKey } from '@/lib/analytics/aggregate'

// The four admin dashboard panels that do not come from sale lines: coupon
// redemption, cashback outstanding, user growth and the order drop-off funnel.
//
// Pure functions over flat rows, like aggregate.ts, so that every number on
// the screen is decided against fixtures. The loaders in
// server/analytics/dashboard.ts only fetch and map columns.
//
// Money is integer agorot end to end. The wallet table carries a legacy
// numeric `_ils` mirror next to the agorot column; the loader resolves that
// pair before anything here sees it, so this module never meets a float.

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Percent of `part` in `whole`, one decimal; null when there is no whole. */
export function pctOf(part: number, whole: number): number | null {
  if (whole <= 0) return null
  return round1((100 * part) / whole)
}

// ---------------------------------------------------------------------------
// Coupon redemption
// ---------------------------------------------------------------------------

export type CouponStatus = 'issued' | 'used' | 'expired' | 'refunded'

export type CouponCodeStat = {
  status: CouponStatus
  createdAt: string
  redeemedAt: string | null
  expiresAt: string
}

export type CouponRedemption = {
  /** Every code in the window, whatever its state. */
  total: number
  /** Still open: issued and not past its expiry. */
  open: number
  used: number
  /** Marked expired, or still `issued` with an expiry already behind `now`. */
  expired: number
  refunded: number
  /**
   * Used out of the codes whose fate is decided (used + expired). The open
   * ones have not had their chance yet and would drag the rate down for no
   * reason; refunds were never the customer's to redeem.
   */
  redemptionRatePct: number | null
  /** Used out of everything that was not refunded, open codes included. */
  usedOfIssuedPct: number | null
  /** Expired out of the decided ones: the breakage the business keeps. */
  breakagePct: number | null
  /** Median calendar days from issue to scan, over the used codes. */
  medianDaysToRedeem: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 1
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
  return round1(value)
}

/**
 * A code whose row still says `issued` but whose expiry has passed is expired
 * for the purpose of a rate: the sweeper that flips the status runs on a
 * schedule and the dashboard must not depend on it having run.
 */
export function effectiveCouponStatus(code: CouponCodeStat, now: Date): CouponStatus {
  if (code.status === 'issued' && new Date(code.expiresAt).getTime() < now.getTime()) {
    return 'expired'
  }
  return code.status
}

export function couponRedemption(codes: readonly CouponCodeStat[], now: Date): CouponRedemption {
  let open = 0
  let used = 0
  let expired = 0
  let refunded = 0
  const daysToRedeem: number[] = []

  for (const code of codes) {
    const status = effectiveCouponStatus(code, now)
    if (status === 'issued') open += 1
    else if (status === 'used') {
      used += 1
      if (code.redeemedAt) {
        const elapsed = new Date(code.redeemedAt).getTime() - new Date(code.createdAt).getTime()
        if (elapsed >= 0) daysToRedeem.push(elapsed / DAY_MS)
      }
    } else if (status === 'expired') expired += 1
    else refunded += 1
  }

  const decided = used + expired
  return {
    total: codes.length,
    open,
    used,
    expired,
    refunded,
    redemptionRatePct: pctOf(used, decided),
    usedOfIssuedPct: pctOf(used, codes.length - refunded),
    breakagePct: pctOf(expired, decided),
    medianDaysToRedeem: median(daysToRedeem),
  }
}

// ---------------------------------------------------------------------------
// Cashback outstanding
// ---------------------------------------------------------------------------

export type CashbackWalletRow = {
  balanceAgorot: number
  lifetimeEarnedAgorot: number
  lifetimeRedeemedAgorot: number
}

export type CashbackOutstanding = {
  /** Sum of positive balances: what customers can still spend against us. */
  outstandingAgorot: number
  /** Wallets holding a positive balance. */
  walletsWithBalance: number
  /** Every wallet row, including empty ones. */
  wallets: number
  lifetimeEarnedAgorot: number
  lifetimeRedeemedAgorot: number
  /** Redeemed out of earned, lifetime: how much of the cashback actually comes back. */
  redeemedSharePct: number | null
  /** Outstanding divided by wallets with a balance, integer agorot. */
  averageBalanceAgorot: number
  /**
   * Wallets whose balance is below zero. There should be none; a wallet is
   * debited only against its own balance, so a negative one is a ledger fault
   * to chase, not a number to add up.
   */
  negativeWallets: number
}

function assertInteger(value: number, field: string): number {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${field} must be integer agorot, got ${value}`)
  }
  return value
}

export function cashbackOutstanding(wallets: readonly CashbackWalletRow[]): CashbackOutstanding {
  let outstanding = 0
  let withBalance = 0
  let negative = 0
  let earned = 0
  let redeemed = 0

  for (const wallet of wallets) {
    const balance = assertInteger(wallet.balanceAgorot, 'balanceAgorot')
    if (balance > 0) {
      outstanding += balance
      withBalance += 1
    } else if (balance < 0) {
      negative += 1
    }
    earned += assertInteger(wallet.lifetimeEarnedAgorot, 'lifetimeEarnedAgorot')
    redeemed += assertInteger(wallet.lifetimeRedeemedAgorot, 'lifetimeRedeemedAgorot')
  }

  return {
    outstandingAgorot: outstanding,
    walletsWithBalance: withBalance,
    wallets: wallets.length,
    lifetimeEarnedAgorot: earned,
    lifetimeRedeemedAgorot: redeemed,
    redeemedSharePct: pctOf(redeemed, earned),
    averageBalanceAgorot: withBalance > 0 ? Math.round(outstanding / withBalance) : 0,
    negativeWallets: negative,
  }
}

// ---------------------------------------------------------------------------
// User growth
// ---------------------------------------------------------------------------

export type GrowthBucket = {
  key: string
  newUsers: number
  /** Users registered up to and including this bucket, from `priorCount` up. */
  cumulativeUsers: number
}

/**
 * Sign-ups per period plus the running total. `priorCount` is how many
 * profiles existed before the window opened, so the cumulative line starts at
 * the real number and not at zero.
 */
export function bucketSignups(
  createdAts: readonly string[],
  period: Period,
  priorCount = 0,
): GrowthBucket[] {
  const counts = new Map<string, number>()
  for (const iso of createdAts) {
    const key = periodKey(iso, period)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  let running = priorCount
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, newUsers]) => {
      running += newUsers
      return { key, newUsers, cumulativeUsers: running }
    })
}

export type GrowthTotals = {
  newUsers: number
  totalUsers: number
  /** New users in the window as a percent of the users before it. */
  growthPct: number | null
}

export function growthTotals(buckets: readonly GrowthBucket[], priorCount: number): GrowthTotals {
  const newUsers = buckets.reduce((sum, bucket) => sum + bucket.newUsers, 0)
  return {
    newUsers,
    totalUsers: priorCount + newUsers,
    growthPct: pctOf(newUsers, priorCount),
  }
}

// ---------------------------------------------------------------------------
// Order drop-off funnel
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'cancelled'
  | 'refunded'
  | 'platform_settled'

export type OrderStat = {
  status: OrderStatus
  paidAt: string | null
  /** Pending orders die at this stamp; null means no reservation clock. */
  expiresAt: string | null
}

export type DropoffStep = {
  key: string
  label: string
  value: number
  fromPreviousPct: number | null
  fromTopPct: number | null
}

export type OrderDropoff = {
  steps: DropoffStep[]
  /** Where the orders that did not reach the end went. */
  losses: { key: string; label: string; value: number; ofCreatedPct: number | null }[]
  /** Pending orders whose reservation has not run out yet. */
  stillOpen: number
  /** Created and never paid, whatever became of them since. */
  unpaid: number
}

const FULFILLED_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'partially_fulfilled',
  'fulfilled',
  'platform_settled',
])

/**
 * Created, paid, fulfilled: the three states an order passes through, and the
 * three exits. `paid_at` decides "paid", not the status, because a refunded or
 * fulfilled order was paid on the way and belongs in that step's count.
 */
export function orderDropoff(orders: readonly OrderStat[], now: Date): OrderDropoff {
  const created = orders.length
  let paid = 0
  let fulfilled = 0
  let expiredUnpaid = 0
  let stillOpen = 0
  let cancelled = 0
  let refunded = 0

  for (const order of orders) {
    if (order.paidAt) paid += 1
    if (FULFILLED_STATUSES.has(order.status)) fulfilled += 1

    if (order.status === 'pending') {
      const expired = order.expiresAt ? new Date(order.expiresAt).getTime() < now.getTime() : false
      if (expired) expiredUnpaid += 1
      else stillOpen += 1
    } else if (order.status === 'cancelled') {
      cancelled += 1
    } else if (order.status === 'refunded') {
      refunded += 1
    }
  }

  const steps: DropoffStep[] = [
    {
      key: 'created',
      label: 'הזמנות שנוצרו',
      value: created,
      fromPreviousPct: null,
      fromTopPct: null,
    },
    {
      key: 'paid',
      label: 'שולמו',
      value: paid,
      fromPreviousPct: pctOf(paid, created),
      fromTopPct: pctOf(paid, created),
    },
    {
      key: 'fulfilled',
      label: 'סופקו או נסרקו',
      value: fulfilled,
      fromPreviousPct: pctOf(fulfilled, paid),
      fromTopPct: pctOf(fulfilled, created),
    },
  ]

  return {
    steps,
    losses: [
      {
        key: 'expired_unpaid',
        label: 'פגו בלי תשלום',
        value: expiredUnpaid,
        ofCreatedPct: pctOf(expiredUnpaid, created),
      },
      {
        key: 'cancelled',
        label: 'בוטלו',
        value: cancelled,
        ofCreatedPct: pctOf(cancelled, created),
      },
      { key: 'refunded', label: 'הוחזרו', value: refunded, ofCreatedPct: pctOf(refunded, created) },
    ],
    stillOpen,
    unpaid: created - paid,
  }
}

// ---------------------------------------------------------------------------
// Behavioural funnel from raw events
// ---------------------------------------------------------------------------

export type FunnelEvent = {
  sessionId: string
  eventName: string
  /** `props.step` for checkout_step events, otherwise null. */
  step: string | null
}

export type BehaviouralFunnel = {
  sessions: number
  productViews: number
  addToCarts: number
  checkoutSteps: number
  checkouts: number
  purchases: number
}

/**
 * The same six counts v_funnel_daily produces, computed from the raw events
 * for databases where that view was never created. Each step counts distinct
 * sessions, so a customer who opened five products is one product-viewing
 * session, exactly as the view counts it. Purchases are supplied by the caller
 * from the orders table; a purchase is money, and money is never counted from
 * a client event.
 */
export function behaviouralFunnel(
  events: readonly FunnelEvent[],
  purchases: number,
): BehaviouralFunnel {
  const sessions = new Set<string>()
  const productViews = new Set<string>()
  const addToCarts = new Set<string>()
  const checkoutSteps = new Set<string>()
  const checkouts = new Set<string>()

  for (const event of events) {
    sessions.add(event.sessionId)
    if (event.eventName === 'view_product') productViews.add(event.sessionId)
    else if (event.eventName === 'add_to_cart') addToCarts.add(event.sessionId)
    else if (event.eventName === 'checkout_step') {
      checkoutSteps.add(event.sessionId)
      if (event.step === 'payment_redirect') checkouts.add(event.sessionId)
    }
  }

  return {
    sessions: sessions.size,
    productViews: productViews.size,
    addToCarts: addToCarts.size,
    checkoutSteps: checkoutSteps.size,
    checkouts: checkouts.size,
    purchases,
  }
}
