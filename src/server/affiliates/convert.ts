import {
  type AffiliateCampaign,
  type CampaignDbRow,
  type ConversionLine,
  campaignFromRow,
  decideConversion,
  selectCampaign,
} from '@/lib/affiliates/commission'
import { type Agorot, agorot, sumAgorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { normalizeReferralCode } from '@/lib/referrals/code'
import type { createAdminClient } from '@/lib/supabase/admin'
import { payAffiliateConversion } from '@/server/affiliates/pay'
import { recordUserSignals } from '@/server/affiliates/signals'

type AdminClient = ReturnType<typeof createAdminClient>

/** Postgres: undefined_table. A database without 244 has no campaigns table. */
const UNDEFINED_TABLE = '42P01'
/** Postgres: unique_violation. `affiliate_conversions.order_id` is UNIQUE. */
const UNIQUE_VIOLATION = '23505'

const CAMPAIGN_COLUMNS =
  'id, name, commission_bp, min_order_agorot, max_commission_agorot, budget_agorot, max_conversions_per_day, require_manual_approval, starts_at, ends_at, is_active, category_id, product_id, deleted_at'

/**
 * Turns a paid, attributed order into an affiliate conversion, and pays it
 * when nothing needs a person to look first.
 *
 * CALLED FROM FINALIZE, AFTER THE REFERRAL. The friend-referral completion
 * runs first so that `referrals.referred_first_order_id` is set by the time
 * this asks "did this order already pay this affiliate a referral bonus". One
 * order pays one programme, never both to the same person.
 *
 * EVERY DECISION IS IN `decideConversion`, which has no IO and is tested on
 * its own. This function only gathers what it asks for: the affiliate, the
 * live campaigns, the lines, the fraud signals, the last 24 hours, the
 * campaign's committed spend, the referral overlap. Nothing here says yes or
 * no.
 *
 * WHY A FAILURE IS LOGGED AND NOT THROWN. The card is already charged when
 * finalize reaches this line; a thrown error reaches the webhook as "payment
 * verified but finalize failed", the worst state in the system. A commission
 * that did not post is a row the operator can settle from /admin/affiliates,
 * or an order with a code and no row, which the log names.
 *
 * WITHOUT 244 APPLIED the campaigns read answers 42P01 and this returns after
 * one warning. The order keeps its `affiliate_code`; nothing else happens.
 */
export async function recordAffiliateConversionForOrder(
  admin: AdminClient,
  input: {
    orderId: string
    userId: string
    /** `orders.affiliate_code` as finalize read it. */
    affiliateCode: string | null | undefined
    /** The Cardcom card token, when this payment carried one. */
    cardToken?: string | null
    now?: Date
  },
): Promise<void> {
  const code = normalizeReferralCode(input.affiliateCode)
  if (!code) return
  const now = input.now ?? new Date()

  try {
    const { data: affiliate, error: affiliateError } = await admin
      .from('affiliates')
      .select('id, user_id, status')
      .eq('affiliate_code', code)
      .is('deleted_at', null)
      .maybeSingle()
    if (affiliateError) {
      log.warn('affiliates.affiliate_read_failed', {
        orderId: input.orderId,
        reason: affiliateError.message,
      })
      return
    }
    if (!affiliate) {
      // A code that belongs to a customer who never joined the programme. The
      // friend-referral path has already had its say on this order.
      log.info('affiliates.code_not_enrolled', { orderId: input.orderId })
      return
    }

    const { data: campaignRows, error: campaignError } = await admin
      .from('affiliate_campaigns' as never)
      .select(CAMPAIGN_COLUMNS)
      .eq('is_active', true)
      .is('deleted_at', null)
    if (campaignError) {
      if (campaignError.code === UNDEFINED_TABLE) {
        log.warn('affiliates.campaigns_table_missing', {
          orderId: input.orderId,
          detail:
            'affiliate_campaigns absent: apply migrations/pending/244_affiliate_campaigns.sql',
        })
      } else {
        log.warn('affiliates.campaigns_read_failed', {
          orderId: input.orderId,
          reason: campaignError.message,
        })
      }
      return
    }
    const campaigns = ((campaignRows ?? []) as unknown as CampaignDbRow[]).map(campaignFromRow)

    const lines = await readLines(admin, input.orderId)
    const campaign = selectCampaign(campaigns, lines, now)

    // The three questions the decision asks about the world, gathered only
    // when there is a campaign to pay under.
    let fraudSignals: string[] = []
    let conversionsLast24h = 0
    let campaignCommittedAgorot: Agorot = agorot(0)
    let referralBonusPaidToAffiliate = false

    if (campaign) {
      await recordUserSignals(admin, input.userId, { cardToken: input.cardToken ?? null })
      ;[fraudSignals, conversionsLast24h, campaignCommittedAgorot, referralBonusPaidToAffiliate] =
        await Promise.all([
          readFraudSignals(admin, affiliate.user_id, input.userId),
          countRecentConversions(admin, affiliate.id, now),
          readCommittedSpend(admin, campaign),
          referralPaidForOrder(admin, affiliate.user_id, input.userId, input.orderId),
        ])
    }

    const decision = decideConversion({
      affiliate: { userId: affiliate.user_id, status: affiliate.status },
      buyerUserId: input.userId,
      campaign,
      lines,
      fraudSignals,
      conversionsLast24h,
      campaignCommittedAgorot,
      referralBonusPaidToAffiliate,
    })

    if (decision.kind === 'skip') {
      log.info('affiliates.conversion_skipped', { orderId: input.orderId, reason: decision.reason })
      return
    }

    // `campaign` is non-null for every non-skip decision: decideConversion
    // returns `no_live_campaign` before anything else can be decided.
    const campaignId = (campaign as AffiliateCampaign).id

    const row =
      decision.kind === 'refuse'
        ? {
            affiliate_id: affiliate.id,
            campaign_id: campaignId,
            order_id: input.orderId,
            buyer_user_id: input.userId,
            order_agorot: decision.baseAgorot,
            commission_agorot: 0,
            status: 'rejected',
            flagged_reasons: [decision.reason],
            rejection_reason: decision.reason,
          }
        : {
            affiliate_id: affiliate.id,
            campaign_id: campaignId,
            order_id: input.orderId,
            buyer_user_id: input.userId,
            order_agorot: decision.baseAgorot,
            commission_agorot: decision.commissionAgorot,
            status: decision.status,
            flagged_reasons: decision.flaggedReasons.length > 0 ? decision.flaggedReasons : null,
            rejection_reason: null,
          }

    const { data: inserted, error: insertError } = await admin
      .from('affiliate_conversions' as never)
      .insert(row as never)
      .select('id')
      .maybeSingle()
    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        // A replayed finalize. The first run's row stands, and if it was
        // pending its payout is idempotent on its own key.
        log.info('affiliates.conversion_already_recorded', { orderId: input.orderId })
        return
      }
      log.warn('affiliates.conversion_insert_failed', {
        orderId: input.orderId,
        reason: insertError.message,
      })
      return
    }
    const conversionId = (inserted as { id?: string } | null)?.id
    if (!conversionId) return

    if (decision.kind === 'refuse') {
      log.warn('affiliates.conversion_refused', { orderId: input.orderId, reason: decision.reason })
      return
    }
    if (decision.status === 'flagged') {
      log.info('affiliates.conversion_held', {
        orderId: input.orderId,
        reasons: decision.flaggedReasons,
      })
      return
    }

    const paid = await payAffiliateConversion(admin, conversionId, null)
    log.info('affiliates.conversion_result', {
      orderId: input.orderId,
      ok: paid.ok,
      reason: paid.reason,
    })
  } catch (error) {
    log.warn('affiliates.conversion_threw', {
      orderId: input.orderId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/** The order's lines with the category each product sits in. */
async function readLines(admin: AdminClient, orderId: string): Promise<ConversionLine[]> {
  const { data: items, error } = await admin
    .from('order_items')
    .select('product_id, paid_on_site_agorot')
    .eq('order_id', orderId)
  if (error) {
    log.warn('affiliates.items_read_failed', { orderId, reason: error.message })
    return []
  }
  const productIds = [
    ...new Set((items ?? []).map((i) => i.product_id).filter((id): id is string => !!id)),
  ]
  const categoryByProduct = new Map<string, string | null>()
  if (productIds.length > 0) {
    const { data: products, error: productsError } = await admin
      .from('products')
      .select('id, category_id')
      .in('id', productIds)
    if (productsError) {
      // A category-scoped campaign cannot match without this; the lines still
      // carry their product ids, so product and site-wide scopes are unaffected.
      log.warn('affiliates.products_read_failed', { orderId, reason: productsError.message })
    }
    for (const p of products ?? []) categoryByProduct.set(p.id, p.category_id)
  }
  return (items ?? []).map((item) => ({
    productId: item.product_id,
    categoryId: item.product_id ? (categoryByProduct.get(item.product_id) ?? null) : null,
    paidOnSiteAgorot: agorot(Math.round(Number(item.paid_on_site_agorot ?? 0))),
  }))
}

async function readFraudSignals(admin: AdminClient, affiliateUserId: string, buyerUserId: string) {
  const { data, error } = await admin.rpc('fn_referral_fraud_signals', {
    p_referrer_id: affiliateUserId,
    p_referred_id: buyerUserId,
  })
  if (error) {
    log.warn('affiliates.fraud_signals_failed', { reason: error.message })
    return [] as string[]
  }
  return Array.isArray(data) ? (data as string[]) : []
}

async function countRecentConversions(
  admin: AdminClient,
  affiliateId: string,
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from('affiliate_conversions' as never)
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', affiliateId)
    .neq('status', 'rejected')
    .gte('created_at', since)
  if (error) {
    log.warn('affiliates.velocity_read_failed', { affiliateId, reason: error.message })
    return 0
  }
  return count ?? 0
}

async function readCommittedSpend(
  admin: AdminClient,
  campaign: AffiliateCampaign,
): Promise<Agorot> {
  if (campaign.budgetAgorot === null) return agorot(0)
  const { data, error } = await admin
    .from('affiliate_conversions' as never)
    .select('commission_agorot')
    .eq('campaign_id', campaign.id)
    .in('status', ['paid', 'pending', 'flagged'])
    .limit(10_000)
  if (error) {
    log.warn('affiliates.budget_read_failed', { campaignId: campaign.id, reason: error.message })
    // Unknown spend is read as "the budget is spent": the conservative side
    // of a money decision is the one that pays nothing until a person looks.
    return campaign.budgetAgorot
  }
  const rows = (data ?? []) as unknown as Array<{ commission_agorot: number }>
  return sumAgorot(rows.map((r) => agorot(Math.round(Number(r.commission_agorot ?? 0)))))
}

async function referralPaidForOrder(
  admin: AdminClient,
  affiliateUserId: string,
  buyerUserId: string,
  orderId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('referrals')
    .select('id')
    .eq('referred_user_id', buyerUserId)
    .eq('referrer_user_id', affiliateUserId)
    .eq('referred_first_order_id', orderId)
    .limit(1)
  if (error) {
    log.warn('affiliates.referral_overlap_read_failed', { orderId, reason: error.message })
    return false
  }
  return (data ?? []).length > 0
}
