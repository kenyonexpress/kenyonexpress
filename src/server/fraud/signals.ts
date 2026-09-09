import { isDisposableEmail } from '@/lib/fraud/disposable-email'
import { type RiskAssessment, type RiskSignals, assessRisk } from '@/lib/fraud/risk-score'
import type { VelocityCounts } from '@/lib/fraud/velocity'
import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Reading the fraud signals out of the database this shop actually has.
 *
 * THE DIVISION THAT MATTERS. Everything the REFUSING layer needs
 * (`lib/fraud/velocity.ts`) is read from `orders`, `payments` and
 * `payment_tokens`, which exist in production today. Nothing here has to be
 * applied for a card tester to be stopped. The only part that needs
 * `migrations/pending/202` is WRITING the assessment down, and a write that
 * cannot land is allowed to fail quietly - see `recordRiskAssessment`.
 *
 * EVERY READ FAILS OPEN, AND THAT IS A CHOICE WITH A COST. A signal that cannot
 * be read is returned as zero, which means a database hiccup during a card
 * testing run lets the run through. The alternative - refusing every purchase
 * whenever a count query errors - converts a degraded read path into a total
 * outage of the shop, and the abuse this layer prevents is smaller than that.
 * Each failure logs at warn, so the gap is visible rather than silent.
 */

/**
 * The service-role client. Three of the tables read and written here are not in
 * the generated `Database` type until 202 is applied, so the calls that touch
 * them carry a cast at the call site rather than this module pretending to a
 * schema production does not have.
 */
type Client = ReturnType<typeof createAdminClient>

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204'])
const UNDEFINED_COLUMN = '42703'

/**
 * Rows, or none.
 *
 * THIS MODULE'S ONE HARD CONTRACT IS THAT IT CANNOT BREAK A PURCHASE. Every
 * read here sits in front of the Cardcom call, so a shape that is not an array
 * - a client that answers a single object, a stub, a future PostgREST that
 * returns something else on an error path - must degrade to "no signal" rather
 * than throw `.map is not a function` out of `beginCheckout` and take the
 * checkout down with it. Losing a fraud signal costs a signal; throwing here
 * costs the sale.
 */
function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Orders belonging to this user since `since`. Bounded by the window, not by a page. */
async function orderIdsSince(client: Client, userId: string, since: Date): Promise<string[]> {
  const { data, error } = await client
    .from('orders')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .limit(500)
  if (error) {
    log.warn('fraud.orders_read_failed', { userId, reason: error.message })
    return []
  }
  return rows<{ id: string }>(data).map((row) => row.id)
}

/**
 * The three counts the velocity rules compare against.
 *
 * @param tokenId the saved card about to be charged, or null for the hosted
 *   page - where we do not know the card until Cardcom answers, so the
 *   shared-card rule cannot fire and is reported as 1 (this account only).
 */
export async function readVelocityCounts(
  client: Client,
  args: { userId: string; tokenId: string | null; now: Date },
): Promise<VelocityCounts> {
  const { userId, tokenId, now } = args
  const dayAgo = new Date(now.getTime() - DAY_MS)
  const hourAgo = new Date(now.getTime() - HOUR_MS)

  try {
    const dayOrderIds = await orderIdsSince(client, userId, dayAgo)

    const [declinedPaymentsLastHour, distinctCardsLastDay, profilesSharingCard] = await Promise.all(
      [
        countDeclinedPayments(client, dayOrderIds, hourAgo),
        countDistinctCards(client, dayOrderIds),
        countProfilesSharingCard(client, tokenId),
      ],
    )

    return { declinedPaymentsLastHour, distinctCardsLastDay, profilesSharingCard }
  } catch (error) {
    // FAILS OPEN, ALL THE WAY OUT. The individual reads already swallow their
    // PostgREST errors; this catches the shapes they cannot - a builder that
    // throws synchronously, a client that is not what this module expects.
    //
    // Returning zeroes means a database problem during a card-testing run lets
    // the run through, and that is the trade taken deliberately: the
    // alternative is that every purchase on the site fails whenever these
    // counts cannot be read, which is a bigger outage than the abuse. Loud,
    // because from here the velocity limits are not limiting anything.
    log.error('fraud.velocity_read_unavailable', {
      userId,
      reason: error instanceof Error ? error.message : String(error),
    })
    return { declinedPaymentsLastHour: 0, distinctCardsLastDay: 0, profilesSharingCard: 0 }
  }
}

async function countDeclinedPayments(
  client: Client,
  orderIds: string[],
  since: Date,
): Promise<number> {
  if (orderIds.length === 0) return 0
  const { count, error } = await client
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .in('order_id', orderIds)
    .eq('status', 'failed')
    .gte('created_at', since.toISOString())
  if (error) {
    log.warn('fraud.declined_payments_read_failed', { reason: error.message })
    return 0
  }
  return count ?? 0
}

/**
 * Distinct saved cards charged by this account in the last day.
 *
 * NEEDS `payments.token_id`, WHICH PRODUCTION DOES NOT HAVE (measured
 * 2026-09-09; `migrations/pending/202` adds it). Until then this returns 0 and
 * the `distinct_cards` velocity rule cannot fire - so it is stated here rather
 * than left to be discovered as a rule that mysteriously never triggers. The
 * other two rules are unaffected, and `card_across_accounts`, which is the one
 * that catches a stolen number spread over new accounts, does not need it.
 */
async function countDistinctCards(client: Client, orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0
  const { data, error } = await client
    .from('payments')
    .select('token_id')
    .in('order_id', orderIds)
    .not('token_id', 'is', null)
    .limit(500)
  if (error) {
    if (error.code !== UNDEFINED_COLUMN) {
      log.warn('fraud.distinct_cards_read_failed', { reason: error.message })
    }
    return 0
  }
  const tokens = new Set(
    rows<{ token_id: string | null }>(data)
      .map((row) => row.token_id)
      .filter((id): id is string => typeof id === 'string'),
  )
  return tokens.size
}

/**
 * How many profiles hold the card being charged.
 *
 * Two lookups rather than a join, because the join direction that matters is
 * "token string -> profiles" and the client cannot express a self-join. Cheap:
 * both are single-column index reads.
 */
async function countProfilesSharingCard(client: Client, tokenId: string | null): Promise<number> {
  if (!tokenId) return 0
  const { data: token, error: tokenError } = await client
    .from('payment_tokens')
    .select('cardcom_token')
    .eq('id', tokenId)
    .maybeSingle()
  if (tokenError || !token) {
    if (tokenError) log.warn('fraud.token_read_failed', { reason: tokenError.message })
    return 0
  }
  const cardcomToken = (token as { cardcom_token: string }).cardcom_token

  const { data: holders, error: holdersError } = await client
    .from('payment_tokens')
    .select('profile_id')
    .eq('cardcom_token', cardcomToken)
    .limit(50)
  if (holdersError) {
    log.warn('fraud.card_holders_read_failed', { reason: holdersError.message })
    return 0
  }
  const profiles = new Set(rows<{ profile_id: string }>(holders).map((row) => row.profile_id))
  return profiles.size
}

export type RiskContext = {
  userId: string
  orderId: string
  totalAgorot: number
  discountShareBps: number
  giftToOtherRecipient: boolean
  tokenId: string | null
  now: Date
}

/**
 * Everything `assessRisk` needs, plus the velocity counts it shares with the
 * refusing layer, so a checkout reads them once and uses them twice.
 */
export async function readRiskSignals(
  client: Client,
  context: RiskContext,
  velocity: VelocityCounts,
): Promise<RiskSignals> {
  const [profile, previousPaidOrders] = await Promise.all([
    readProfile(client, context.userId),
    countPreviousPaidOrders(client, context.userId, context.orderId),
  ])

  return {
    declinedPaymentsLastHour: velocity.declinedPaymentsLastHour,
    distinctCardsLastDay: velocity.distinctCardsLastDay,
    profilesSharingCard: velocity.profilesSharingCard,
    accountAgeMinutes: profile.ageMinutes,
    disposableEmail: profile.email ? isDisposableEmail(profile.email) : false,
    previousPaidOrders,
    totalAgorot: context.totalAgorot,
    // Left to the caller: the IP count is a rate-limiter question, not a table
    // one, and nothing stores an IP against an order until 202 is applied.
    ordersFromIpLastHour: 0,
    giftToOtherRecipient: context.giftToOtherRecipient,
    discountShareBps: context.discountShareBps,
  }
}

async function readProfile(
  client: Client,
  userId: string,
): Promise<{ email: string | null; ageMinutes: number }> {
  const { data, error } = await client
    .from('profiles')
    .select('email, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) {
    if (error) log.warn('fraud.profile_read_failed', { userId, reason: error.message })
    // A very large age, not zero: an unreadable profile must not be reported as
    // a brand-new account, which is a signal we would then be inventing.
    return { email: null, ageMinutes: Number.MAX_SAFE_INTEGER }
  }
  const row = data as { email: string | null; created_at: string }
  const created = Date.parse(row.created_at)
  const ageMinutes = Number.isFinite(created)
    ? Math.max(0, Math.floor((Date.now() - created) / 60_000))
    : Number.MAX_SAFE_INTEGER
  return { email: row.email, ageMinutes }
}

async function countPreviousPaidOrders(
  client: Client,
  userId: string,
  exceptOrderId: string,
): Promise<number> {
  const { count, error } = await client
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'paid')
    .neq('id', exceptOrderId)
  if (error) {
    log.warn('fraud.previous_orders_read_failed', { userId, reason: error.message })
    // Not zero: reporting "no previous orders" for a returning customer fires
    // `first_order_high_value` on somebody who has shopped here for a year.
    return 1
  }
  return count ?? 0
}

/**
 * Writes the assessment. NEVER THROWS, and never blocks anything.
 *
 * The table arrives with 202. Until then every call here 42P01s, which is the
 * expected state and is logged once per process rather than once per order -
 * an unscored order is a smaller problem than a checkout that fails because the
 * scoring table is missing, and there is no version of this write that is worth
 * a customer's purchase.
 */
let missingTableWarned = false

export async function recordRiskAssessment(
  client: Client,
  args: {
    orderId: string
    assessment: RiskAssessment
    signals: RiskSignals
    clientIp: string | null
  },
): Promise<{ recorded: boolean }> {
  // The try is what makes "never throws" true rather than aspirational: a
  // PostgREST builder resolves its errors, but constructing one can throw, and
  // this call sits inside a checkout that has already created an order.
  let error: { code?: string; message?: string } | null
  try {
    ;({ error } = await client.from('order_risk_assessments').upsert(
      {
        order_id: args.orderId,
        score: args.assessment.score,
        band: args.assessment.band,
        reasons: args.assessment.reasons,
        signals: args.signals as unknown as Record<string, unknown>,
        // 'unknown' is what `getClientIp` returns with no proxy in front. It is
        // not an address and `inet` would reject it, so it is stored as null.
        client_ip: args.clientIp && args.clientIp !== 'unknown' ? args.clientIp : null,
      } as never,
      { onConflict: 'order_id' },
    ))
  } catch (thrown) {
    log.warn('fraud.risk_write_threw', {
      orderId: args.orderId,
      reason: thrown instanceof Error ? thrown.message : String(thrown),
    })
    return { recorded: false }
  }

  if (!error) return { recorded: true }

  if (MISSING_TABLE.has(error.code ?? '')) {
    if (!missingTableWarned) {
      missingTableWarned = true
      log.warn('fraud.risk_table_missing', {
        detail: 'order_risk_assessments is not applied. Orders are scored but not recorded.',
      })
    }
    return { recorded: false }
  }

  log.warn('fraud.risk_write_failed', { orderId: args.orderId, reason: error.message })
  return { recorded: false }
}

/** Test seam. Never called by application code. */
export function __resetRiskTableWarning(): void {
  missingTableWarned = false
}

/** Convenience for callers that want both layers from one set of reads. */
export async function scoreOrder(
  client: Client,
  context: RiskContext,
  velocity: VelocityCounts,
  clientIp: string | null,
): Promise<RiskAssessment> {
  try {
    const signals = await readRiskSignals(client, context, velocity)
    const assessment = assessRisk(signals)
    await recordRiskAssessment(client, {
      orderId: context.orderId,
      assessment,
      signals,
      clientIp,
    })
    return assessment
  } catch (error) {
    // The boundary `beginCheckout` calls, and the order it is scoring HAS
    // ALREADY BEEN CREATED by the time control reaches here. Throwing would
    // abandon a pending order with stock reserved against it for the sake of an
    // advisory number that refuses nothing. An unscored order is the correct
    // failure.
    log.warn('fraud.score_unavailable', {
      orderId: context.orderId,
      reason: error instanceof Error ? error.message : String(error),
    })
    return { score: 0, band: 'low', reasons: [] }
  }
}
