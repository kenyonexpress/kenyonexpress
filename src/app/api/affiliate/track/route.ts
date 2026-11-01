import { CacheControl } from '@/lib/cache/http'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

async function handleGET(request: NextRequest) {
  try {
    const campaignSlug = request.nextUrl.searchParams.get('campaign')
    if (!campaignSlug) {
      return NextResponse.json({ error: 'campaign parameter required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify campaign exists and is active
    const { data: campaign, error: campaignError } = await admin
      .from('affiliate_campaigns')
      .select('id, slug, cookie_days')
      .eq('slug', campaignSlug)
      .eq('active', true)
      .maybeSingle()

    if (campaignError) {
      log.error('affiliate.campaign_read_failed', { reason: campaignError.message })
      return NextResponse.json({ error: 'internal error' }, { status: 500 })
    }

    if (!campaign) {
      return NextResponse.json({ error: 'campaign not found or inactive' }, { status: 404 })
    }

    // Record the click
    const { error: clickError } = await admin.from('affiliate_clicks').insert({
      campaign_id: campaign.id,
      user_id: null, // Set when user logs in or places order
    })

    if (clickError) {
      log.error('affiliate.click_insert_failed', { reason: clickError.message })
      // Don't fail the request, just log it
    }

    // Set cookie
    const response = NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': CacheControl.private } },
    )
    const cookieMaxAge = campaign.cookie_days * 24 * 60 * 60
    response.cookies.set('ke_aff', campaignSlug, {
      maxAge: cookieMaxAge,
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch (error) {
    log.error('affiliate.track_failed', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/affiliate/track', handleGET)
