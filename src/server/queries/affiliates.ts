import {
  type AffiliateCampaign,
  type CampaignDbRow,
  type ConversionStatus,
  campaignFromRow,
  campaignIsLive,
} from '@/lib/affiliates/commission'
import { type Agorot, agorot, sumAgorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/** Postgres: undefined_table. A database without 244 has neither new table. */
const UNDEFINED_TABLE = '42P01'

export type AffiliateEnrolment = {
  status: 'pending_review' | 'approved' | 'rejected' | 'suspended'
  code: string
  channel: string | null
  totalConversions: number
  totalEarningsAgorot: Agorot
}

export interface AffiliateConversionRow {
  id: string
  status: ConversionStatus
  createdAt: string
  paidAt: string | null
  baseAgorot: Agorot
  commissionAgorot: Agorot
}

export interface AffiliateStanding {
  /** Null when the customer never joined. */
  enrolment: AffiliateEnrolment | null
  /** Live campaigns, the terms every affiliate earns under right now. */
  campaigns: AffiliateCampaign[]
  /** True when 244 is not applied: the programme cannot pay anyone yet. */
  programmeUnavailable: boolean
  conversions: AffiliateConversionRow[]
  paidAgorot: Agorot
  pendingAgorot: Agorot
}

const STATUSES: ReadonlySet<string> = new Set(['pending', 'flagged', 'paid', 'rejected'])
const ENROLMENT_STATUSES: ReadonlySet<string> = new Set([
  'pending_review',
  'approved',
  'rejected',
  'suspended',
])

function columnAgorot(value: unknown): Agorot {
  return agorot(Math.round(Number(value ?? 0)))
}

/**
 * The customer's own view of the affiliate programme.
 *
 * TWO CLIENTS, AND WHICH READS WHAT. The enrolment row and the conversions are
 * the caller's and come through the REQUEST-SCOPED client, so `auth.uid()`
 * and the 010 / 244 policies decide what comes back, not a filter we
 * remembered to write. The live campaigns are the programme's terms, the same
 * for every visitor, and 244 gives them an admin-only policy; they are read
 * on the service key with no user input reaching the query, the same way
 * `getReferralProgram` reads the referral terms.
 *
 * WHAT IS NOT SHOWN: who bought. `buyer_user_id` is on the row for the
 * operator's queue and is not selected here. An affiliate sees that a sale
 * happened, when, and what it earned.
 */
export async function getMyAffiliateStanding(clock?: Date): Promise<AffiliateStanding | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  // After the session read, never as a parameter default: see getClubStanding.
  const now = clock ?? new Date()

  const [enrolment, campaignsResult, conversionsResult] = await Promise.all([
    readEnrolment(supabase, user.id),
    readLiveCampaigns(now),
    readMyConversions(supabase),
  ])

  const paid = conversionsResult.rows.filter((r) => r.status === 'paid')
  const pending = conversionsResult.rows.filter(
    (r) => r.status === 'pending' || r.status === 'flagged',
  )

  return {
    enrolment,
    campaigns: campaignsResult.campaigns,
    programmeUnavailable: campaignsResult.missing || conversionsResult.missing,
    conversions: conversionsResult.rows,
    paidAgorot: sumAgorot(paid.map((r) => r.commissionAgorot)),
    pendingAgorot: sumAgorot(pending.map((r) => r.commissionAgorot)),
  }
}

async function readEnrolment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<AffiliateEnrolment | null> {
  const { data, error } = await supabase
    .from('affiliates')
    .select(
      'status, affiliate_code, channel_description, total_conversions, total_earnings_ils_agorot',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    log.warn('affiliates.enrolment_read_failed', { reason: error.message })
    return null
  }
  if (!data) return null
  const status = ENROLMENT_STATUSES.has(String(data.status))
    ? (data.status as AffiliateEnrolment['status'])
    : 'pending_review'
  return {
    status,
    code: data.affiliate_code,
    channel: data.channel_description,
    totalConversions: data.total_conversions ?? 0,
    totalEarningsAgorot: columnAgorot(data.total_earnings_ils_agorot),
  }
}

async function readLiveCampaigns(
  now: Date,
): Promise<{ campaigns: AffiliateCampaign[]; missing: boolean }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('affiliate_campaigns' as never)
    .select(
      'id, name, commission_bp, min_order_agorot, max_commission_agorot, budget_agorot, max_conversions_per_day, require_manual_approval, starts_at, ends_at, is_active, category_id, product_id, deleted_at',
    )
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      log.info('affiliates.campaigns_table_missing', {
        detail: 'affiliate_campaigns absent: apply migrations/pending/244_affiliate_campaigns.sql',
      })
      return { campaigns: [], missing: true }
    }
    log.warn('affiliates.campaigns_read_failed', { reason: error.message })
    return { campaigns: [], missing: false }
  }
  const campaigns = ((data ?? []) as unknown as CampaignDbRow[])
    .map(campaignFromRow)
    .filter((c) => campaignIsLive(c, now))
  return { campaigns, missing: false }
}

async function readMyConversions(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ rows: AffiliateConversionRow[]; missing: boolean }> {
  const { data, error } = await supabase
    .from('affiliate_conversions' as never)
    .select('id, status, created_at, paid_at, order_agorot, commission_agorot')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { rows: [], missing: true }
    log.warn('affiliates.conversions_read_failed', { reason: error.message })
    return { rows: [], missing: false }
  }
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    status: (STATUSES.has(String(row.status)) ? row.status : 'pending') as ConversionStatus,
    createdAt: String(row.created_at),
    paidAt: (row.paid_at as string | null) ?? null,
    baseAgorot: columnAgorot(row.order_agorot),
    commissionAgorot: columnAgorot(row.commission_agorot),
  }))
  return { rows, missing: false }
}
