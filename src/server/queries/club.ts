import 'server-only'

import { type Agorot, agorot } from '@/lib/commerce/money'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import { createClient } from '@/lib/supabase/server'

export interface ClubTierRow {
  id: number
  key: string
  name_he: string
  min_spend_agorot: number
  benefits_json: unknown
  cashback_bonus_percent: number
  active: boolean
  sort_order: number
}

export interface ClubTierBenefitRow {
  tier_id: number
  cashback_percent: number
  early_access_hours: number
  gift_value_agorot: number
}

export interface MyTier {
  tierKey: string
  tierNameHe: string
  benefits: string[]
  spendAgorot: Agorot
  nextTierNameHe: string | null
  toNextAgorot: Agorot
  cashbackBonusPercent: number
}

function benefitList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((b): b is string => typeof b === 'string') : []
}

/**
 * The signed-in customer's tier, from v_user_tier (migration 282). No row
 * there means no paid spend yet: the customer sits on the lowest active tier,
 * read from club_tiers so a renamed tier shows its new name.
 */
export async function getMyTier(): Promise<MyTier | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: row, error: rowError }, { data: tiers, error: tiersError }] = await Promise.all([
    supabase
      .from('v_user_tier' as never)
      .select(
        'spend_agorot, tier_key, tier_name_he, tier_benefits_json, next_tier_name_he, to_next_agorot',
      )
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('club_tiers' as never)
      .select('key, name_he, min_spend_agorot, benefits_json, sort_order')
      .order('min_spend_agorot', { ascending: true })
      .limit(2),
  ])
  if (rowError || tiersError) {
    log.warn('club.tier_read_failed', {
      reason: rowError?.message ?? tiersError?.message ?? 'unknown',
    })
    return null
  }

  const r = row as {
    spend_agorot: number
    tier_key: string | null
    tier_name_he: string | null
    tier_benefits_json: unknown
    next_tier_name_he: string | null
    to_next_agorot: number
  } | null
  const list = (tiers ?? []) as {
    key: string
    name_he: string
    min_spend_agorot: number
    benefits_json: unknown
    cashback_bonus_percent: number
  }[]

  if (r?.tier_name_he) {
    const currentTier = list.find((t) => t.name_he === r.tier_name_he)
    return {
      tierKey: r.tier_key ?? '',
      tierNameHe: r.tier_name_he,
      benefits: benefitList(r.tier_benefits_json),
      spendAgorot: agorot(Number(r.spend_agorot)),
      nextTierNameHe: r.next_tier_name_he,
      toNextAgorot: agorot(Number(r.to_next_agorot)),
      cashbackBonusPercent: currentTier?.cashback_bonus_percent ?? 0,
    }
  }
  const lowest = list[0]
  if (!lowest) return null
  const next = list[1] ?? null
  return {
    tierKey: lowest.key,
    tierNameHe: lowest.name_he,
    benefits: benefitList(lowest.benefits_json),
    spendAgorot: agorot(0),
    nextTierNameHe: next?.name_he ?? null,
    toNextAgorot: agorot(next ? Number(next.min_spend_agorot) : 0),
    cashbackBonusPercent: lowest.cashback_bonus_percent ?? 0,
  }
}

export interface PublicTier {
  key: string
  nameHe: string
  minSpendAgorot: Agorot
  benefits: string[]
}

/**
 * Active tiers for the public /club page, lowest threshold first. Read as
 * anon: club_tiers_read_active (migration 282) already limits rows to active
 * ones, so the page shows exactly what the admin editor has published.
 * Null on a failed read, so the page can say so instead of claiming no tiers.
 */
export async function listPublicTiers(): Promise<PublicTier[] | null> {
  const { data, error } = await createPublicClient()
    .from('club_tiers' as never)
    .select('key, name_he, min_spend_agorot, benefits_json')
    .eq('active', true)
    .order('min_spend_agorot', { ascending: true })
  if (error) {
    log.warn('club.public_tiers_read_failed', { reason: error.message })
    return null
  }
  return (
    (data ?? []) as Pick<ClubTierRow, 'key' | 'name_he' | 'min_spend_agorot' | 'benefits_json'>[]
  ).map((t) => ({
    key: t.key,
    nameHe: t.name_he,
    minSpendAgorot: agorot(Number(t.min_spend_agorot)),
    benefits: benefitList(t.benefits_json),
  }))
}
