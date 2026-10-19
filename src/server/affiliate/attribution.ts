import 'server-only'

import { isLinkCode } from '@/lib/affiliate/rules'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Records which affiliate link brought an order, at the moment the order is
 * created, with the campaign's commission SNAPSHOTTED (like platform_percent
 * into order_items): a later change to the campaign rate never reprices an
 * order already attributed. Best effort: a failure here is logged and never
 * blocks a checkout.
 */
export async function attributeOrder(input: {
  orderId: string
  buyerUserId: string | null
  linkCode: string | null | undefined
  now?: Date
}): Promise<void> {
  if (!isLinkCode(input.linkCode)) return
  const admin = createAdminClient()
  const now = input.now ?? new Date()

  const { data: link, error } = await admin
    .from('affiliate_links' as never)
    .select(
      'id, affiliate_id, campaign_id, affiliates!inner(user_id, status), affiliate_campaigns!inner(commission_bp, active, starts_at, ends_at)',
    )
    .eq('code', input.linkCode)
    .maybeSingle()
  if (error) {
    log.warn('affiliate.attribution_link_read_failed', { reason: error.message })
    return
  }
  if (!link) return

  const l = link as unknown as {
    id: string
    affiliate_id: string
    campaign_id: string
    affiliates: { user_id: string; status: string }
    affiliate_campaigns: {
      commission_bp: number
      active: boolean
      starts_at: string | null
      ends_at: string | null
    }
  }
  const c = l.affiliate_campaigns
  const live =
    c.active &&
    (!c.starts_at || new Date(c.starts_at) <= now) &&
    (!c.ends_at || new Date(c.ends_at) > now)
  if (l.affiliates.status !== 'approved' || !live) return
  // An affiliate cannot earn on their own purchase.
  if (input.buyerUserId && input.buyerUserId === l.affiliates.user_id) return

  const { error: insertError } = await admin.from('affiliate_attributions' as never).insert({
    order_id: input.orderId,
    affiliate_id: l.affiliate_id,
    campaign_id: l.campaign_id,
    link_id: l.id,
    commission_bp: c.commission_bp,
  } as never)
  if (insertError && insertError.code !== '23505') {
    log.warn('affiliate.attribution_insert_failed', {
      order_id: input.orderId,
      reason: insertError.message,
    })
  }
}
