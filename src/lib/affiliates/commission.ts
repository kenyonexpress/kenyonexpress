import { type Agorot, agorot, applyBp, bp, sumAgorot } from '@/lib/money'

/**
 * The affiliate programme's arithmetic and its decisions, with no IO.
 *
 * WHY THIS IS TYPESCRIPT AND NOT PLPGSQL, unlike the friend-referral programme
 *
 * The referral bonus is a fixed sum the admin typed, so 098 could move it in
 * SQL with no arithmetic. A commission is a PERCENTAGE of what the buyer paid,
 * and the rule of this repository is that every percentage of money goes
 * through `applyBp` in src/lib/money.ts (integer agorot, basis points, half-up
 * rounding, one primitive). A second copy in plpgsql would be the copy that
 * drifts, and it would be the one the tests do not run. So the server module
 * (`server/affiliates/convert.ts`) reads the rows and this file decides; the
 * only thing the database enforces on its own is one conversion per order.
 *
 * WHAT COUNTS AS THE BASE
 *
 * The in-scope lines' `paid_on_site_agorot`: what the customer paid on the site
 * for the products the campaign covers. Not the sticker price (a coupon's face
 * value is mostly paid at the business, and the affiliate did not bring that
 * cash to the platform) and not the whole order when the campaign is scoped to
 * one product. Same reading of "what was paid" the referral minimum uses.
 */

export type ConversionStatus = 'pending' | 'flagged' | 'paid' | 'rejected'

export interface AffiliateCampaign {
  id: string
  name: string
  commissionBp: number
  minOrderAgorot: Agorot
  maxCommissionAgorot: Agorot | null
  budgetAgorot: Agorot | null
  maxConversionsPerDay: number
  requiresManualApproval: boolean
  startsAt: string
  endsAt: string | null
  isActive: boolean
  categoryId: string | null
  productId: string | null
}

/** One order line as the decision needs it. */
export interface ConversionLine {
  productId: string | null
  categoryId: string | null
  paidOnSiteAgorot: Agorot
}

/** A campaign that can pay right now. */
export function campaignIsLive(campaign: AffiliateCampaign, now: Date): boolean {
  if (!campaign.isActive) return false
  if (new Date(campaign.startsAt).getTime() > now.getTime()) return false
  if (campaign.endsAt && new Date(campaign.endsAt).getTime() <= now.getTime()) return false
  return true
}

/** The lines a campaign's scope covers. Both scopes null = every line. */
export function linesInScope(
  campaign: AffiliateCampaign,
  lines: ConversionLine[],
): ConversionLine[] {
  if (campaign.productId) return lines.filter((l) => l.productId === campaign.productId)
  if (campaign.categoryId) return lines.filter((l) => l.categoryId === campaign.categoryId)
  return lines
}

/**
 * Narrowest scope wins, then the higher commission.
 *
 * A product campaign was written for this product on purpose and beats the
 * category campaign it sits inside, which beats the site-wide one. Two
 * campaigns at the same depth pay the better of the two: the admin who set
 * both wanted the affiliate to earn, and paying the lower would be a silent
 * discount on a promise. Deterministic so the same order always picks the
 * same campaign on a replay.
 */
export function selectCampaign(
  campaigns: AffiliateCampaign[],
  lines: ConversionLine[],
  now: Date,
): AffiliateCampaign | null {
  const specificity = (c: AffiliateCampaign) => (c.productId ? 2 : c.categoryId ? 1 : 0)
  const candidates = campaigns
    .filter((c) => campaignIsLive(c, now))
    .filter((c) => linesInScope(c, lines).length > 0)
    .sort((a, b) => {
      const depth = specificity(b) - specificity(a)
      if (depth !== 0) return depth
      if (b.commissionBp !== a.commissionBp) return b.commissionBp - a.commissionBp
      return a.id.localeCompare(b.id)
    })
  return candidates[0] ?? null
}

/** The base the commission is taken on: in-scope lines, integer agorot. */
export function commissionBase(campaign: AffiliateCampaign, lines: ConversionLine[]): Agorot {
  return sumAgorot(linesInScope(campaign, lines).map((l) => l.paidOnSiteAgorot))
}

/** `round_half_up(base * bp / 10000)`, then the campaign's ceiling. */
export function computeCommission(base: Agorot, campaign: AffiliateCampaign): Agorot {
  const raw = applyBp(base, bp(campaign.commissionBp))
  if (campaign.maxCommissionAgorot !== null && raw > campaign.maxCommissionAgorot) {
    return campaign.maxCommissionAgorot
  }
  return raw
}

export type SkipReason =
  | 'affiliate_not_approved'
  | 'no_live_campaign'
  | 'below_minimum'
  | 'zero_commission'
  | 'budget_exhausted'

export type RefuseReason = 'self_purchase' | 'referral_bonus_paid'

export type FlagReason = 'same_device' | 'same_ip' | 'same_card' | 'velocity' | 'manual_approval'

export interface DecisionInput {
  affiliate: { userId: string; status: string }
  buyerUserId: string
  campaign: AffiliateCampaign | null
  lines: ConversionLine[]
  /** From fn_referral_fraud_signals(affiliate, buyer). Unknown names are kept as flags. */
  fraudSignals: string[]
  /** This affiliate's conversions (not rejected) in the last 24h, before this one. */
  conversionsLast24h: number
  /** Commission already committed under this campaign (paid, pending, flagged). */
  campaignCommittedAgorot: Agorot
  /** True when the friend-referral bonus for this same order went to this affiliate. */
  referralBonusPaidToAffiliate: boolean
}

export type ConversionDecision =
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'refuse'; reason: RefuseReason; baseAgorot: Agorot }
  | {
      kind: 'record'
      status: 'pending' | 'flagged'
      baseAgorot: Agorot
      commissionAgorot: Agorot
      flaggedReasons: FlagReason[]
    }

/**
 * Whether, how much, and whether a person has to look first.
 *
 * ORDER OF THE CHECKS, and why it is this order:
 *
 *   1. Refusals that name the affiliate's own conduct (self purchase, the same
 *      order already paid them a referral bonus) come before anything about
 *      the campaign. They are recorded as `rejected` rows rather than dropped,
 *      because an affiliate buying through their own link is the pattern the
 *      operator most wants to see, and a dropped row is invisible.
 *   2. Skips that mean "nothing is owed" (no campaign, under the minimum,
 *      rounds to zero, budget spent) write nothing. Nothing happened.
 *   3. Flags never refuse. A shared household, an office NAT and a busy
 *      affiliate all look like fraud from here, so they wait for a person,
 *      exactly as the referral queue does.
 */
export function decideConversion(input: DecisionInput): ConversionDecision {
  const { affiliate, buyerUserId, campaign } = input
  if (affiliate.status !== 'approved') return { kind: 'skip', reason: 'affiliate_not_approved' }
  if (!campaign) return { kind: 'skip', reason: 'no_live_campaign' }

  const baseAgorot = commissionBase(campaign, input.lines)

  if (affiliate.userId === buyerUserId) {
    return { kind: 'refuse', reason: 'self_purchase', baseAgorot }
  }
  if (input.referralBonusPaidToAffiliate) {
    return { kind: 'refuse', reason: 'referral_bonus_paid', baseAgorot }
  }

  if (baseAgorot < campaign.minOrderAgorot) return { kind: 'skip', reason: 'below_minimum' }

  const commissionAgorot = computeCommission(baseAgorot, campaign)
  if (commissionAgorot <= 0) return { kind: 'skip', reason: 'zero_commission' }

  if (
    campaign.budgetAgorot !== null &&
    input.campaignCommittedAgorot + commissionAgorot > campaign.budgetAgorot
  ) {
    return { kind: 'skip', reason: 'budget_exhausted' }
  }

  const flaggedReasons: FlagReason[] = []
  for (const signal of input.fraudSignals) {
    if (signal === 'same_device' || signal === 'same_ip' || signal === 'same_card') {
      flaggedReasons.push(signal)
    }
  }
  if (input.conversionsLast24h >= campaign.maxConversionsPerDay) flaggedReasons.push('velocity')
  if (campaign.requiresManualApproval) flaggedReasons.push('manual_approval')

  return {
    kind: 'record',
    status: flaggedReasons.length > 0 ? 'flagged' : 'pending',
    baseAgorot,
    commissionAgorot,
    flaggedReasons,
  }
}

/** The columns 244 gives `affiliate_campaigns`, as PostgREST returns them. */
export interface CampaignDbRow {
  id: string
  name: string
  commission_bp: number
  min_order_agorot: number
  max_commission_agorot: number | null
  budget_agorot: number | null
  max_conversions_per_day: number
  require_manual_approval: boolean
  starts_at: string
  ends_at: string | null
  is_active: boolean
  category_id: string | null
  product_id: string | null
  deleted_at?: string | null
}

/** Integer column → Agorot. The round is the TypeScript cast, not a decimal fix. */
function columnAgorot(value: number | null | undefined): Agorot {
  return agorot(Math.round(Number(value ?? 0)))
}

export function campaignFromRow(row: CampaignDbRow): AffiliateCampaign {
  return {
    id: row.id,
    name: row.name,
    commissionBp: Math.round(Number(row.commission_bp)),
    minOrderAgorot: columnAgorot(row.min_order_agorot),
    maxCommissionAgorot:
      row.max_commission_agorot === null ? null : columnAgorot(row.max_commission_agorot),
    budgetAgorot: row.budget_agorot === null ? null : columnAgorot(row.budget_agorot),
    maxConversionsPerDay: Math.round(Number(row.max_conversions_per_day)),
    requiresManualApproval: row.require_manual_approval === true,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active === true && !row.deleted_at,
    categoryId: row.category_id,
    productId: row.product_id,
  }
}
