import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import type { Database } from '@/types/database'
import { cacheLife, cacheTag } from 'next/cache'

export type HotCoupon = Database['public']['Tables']['products']['Row'] & {
  supplier?: {
    name: string | null
    logo_url: string | null
  } | null
}

/**
 * Get featured coupon products (is_coupon_enabled=true) for the home page.
 *
 * These are products that customers can prepay for online and then redeem
 * at the business location. Limited to active, non-deleted products with
 * valid pricing.
 */
async function getHotCoupons(): Promise<HotCoupon[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('products')
    .select(
      `
      *,
      supplier:suppliers(name, logo_url)
    `,
    )
    .eq('is_coupon_enabled', true)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('coupon_price_ils', 0)
    .order('name_he')
    .limit(6)

  if (error) {
    log.error('hot_coupons.failed_to_fetch_hot_coupons', { error })
    return []
  }

  return (data as HotCoupon[]) || []
}
