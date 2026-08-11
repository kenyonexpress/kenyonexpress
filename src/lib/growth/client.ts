import 'server-only'
import type { DiscountCampaign } from '@/lib/growth/discount'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * A narrow, typed door onto the two growth tables.
 *
 * `src/types/database.ts` is generated from the live schema and is edited by
 * more than one session at a time (STATE.md, 2026-07-28), so regenerating the
 * whole 2,600-line file to add two tables would collide with whatever else is
 * in flight. The shape those tables need is declared here instead, and the
 * client is cast ONCE, in this module, rather than `as never` appearing at
 * every call site where it would stop meaning anything.
 *
 * Stopgap with an expiry: when database.ts is next regenerated, delete these
 * types and use the generated ones.
 */

export type DiscountCampaignRow = DiscountCampaign & {
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type DiscountCampaignPerformance = {
  id: string
  code: string
  name: string
  kind: 'percent' | 'fixed'
  is_active: boolean
  starts_at: string | null
  expires_at: string | null
  max_uses: number | null
  max_uses_per_user: number
  allow_stacking: boolean
  used_count: number
  redemptions: number
  distinct_users: number
  total_discount_agorot: number
  /** used_count disagreeing with the ledger: the limits are no longer real. */
  counter_drift: boolean
  last_redeemed_at: string | null
}

type Result<T> = Promise<{ data: T | null; error: { message: string; code?: string } | null }>

/** Only the calls this feature makes. Anything else goes through the real client. */
type GrowthClient = {
  campaigns(): {
    list(): Result<DiscountCampaignPerformance[]>
    byId(id: string): Result<DiscountCampaignRow>
    byCode(code: string): Result<DiscountCampaignRow>
  }
}

export function growthClient(): GrowthClient {
  const admin = createAdminClient()
  // One cast, one reason: the generated types do not know these tables yet.
  // biome-ignore lint/suspicious/noExplicitAny: see the module comment
  const db = admin as any

  return {
    campaigns: () => ({
      list: () =>
        db
          .from('v_discount_campaign_performance')
          .select('*')
          .order('last_redeemed_at', { ascending: false, nullsFirst: false }),
      byId: (id: string) =>
        db.from('discount_campaigns').select('*').eq('id', id).is('deleted_at', null).single(),
      // The lookup the cart makes. Codes are stored already normalised, so this
      // is an equality on an indexed column and not an ILIKE, which could not
      // use the index.
      byCode: (code: string) =>
        db
          .from('discount_campaigns')
          .select('*')
          .eq('code', code)
          .is('deleted_at', null)
          .maybeSingle(),
    }),
  }
}
