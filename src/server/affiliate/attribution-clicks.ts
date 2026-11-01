import { type Agorot, applyBp, bp } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

export async function recordAffiliateClick(input: {
  campaignSlug: string
  userId?: string | null
  now?: Date
}): Promise<void> {
  const admin = createAdminClient()
  const now = input.now ?? new Date()

  try {
    const { data: campaign } = await admin
      .from('affiliate_campaigns')
      .select('id')
      .eq('slug', input.campaignSlug)
      .eq('active', true)
      .maybeSingle()

    if (!campaign) return

    await admin.from('affiliate_clicks').insert({
      campaign_id: campaign.id,
      user_id: input.userId ?? null,
      clicked_at: now.toISOString(),
    })
  } catch (error) {
    log.warn('affiliate.click_record_failed', {
      campaignSlug: input.campaignSlug,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

export async function attributeOrderToAffiliate(input: {
  orderId: string
  campaignSlug: string | null
  userId: string | null
  orderTotalAgorot?: Agorot
  now?: Date
}): Promise<void> {
  if (!input.campaignSlug) return

  const admin = createAdminClient()
  const now = input.now ?? new Date()

  try {
    // Get campaign
    const { data: campaign } = await admin
      .from('affiliate_campaigns')
      .select('id, commission_rate, cookie_days')
      .eq('slug', input.campaignSlug)
      .eq('active', true)
      .maybeSingle()

    if (!campaign) return

    // Find the most recent unattributed click for this campaign and user
    // within the cookie window
    const cutoffTime = new Date(now.getTime() - campaign.cookie_days * 24 * 60 * 60 * 1000)
    const { data: clicks, error: readError } = await admin
      .from('affiliate_clicks')
      .select('id')
      .eq('campaign_id', campaign.id)
      .is('order_id', null)
      .is('converted_at', null)
      .gte('clicked_at', cutoffTime.toISOString())
      .order('clicked_at', { ascending: false })
      .limit(1)

    if (readError) {
      log.warn('affiliate.click_read_failed', {
        campaignSlug: input.campaignSlug,
        orderId: input.orderId,
        reason: readError.message,
      })
      return
    }

    if (!clicks || clicks.length === 0 || !campaign) return

    // Calculate commission
    let commissionAgorot: Agorot | null = null
    if (input.orderTotalAgorot && input.orderTotalAgorot > 0) {
      commissionAgorot = applyBp(input.orderTotalAgorot, bp(campaign.commission_rate))
    }

    // Update the click record with order attribution and conversion
    const clickRecord = clicks[0]
    if (!clickRecord) return

    const { error: updateError } = await admin
      .from('affiliate_clicks')
      .update({
        order_id: input.orderId,
        converted_at: now.toISOString(),
        commission_agorot: commissionAgorot ?? null,
      })
      .eq('id', clickRecord.id)

    if (updateError) {
      log.warn('affiliate.conversion_recording_failed', {
        campaignSlug: input.campaignSlug,
        orderId: input.orderId,
        reason: updateError.message,
      })
    }
  } catch (error) {
    log.warn('affiliate.attribution_error', {
      campaignSlug: input.campaignSlug,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}
