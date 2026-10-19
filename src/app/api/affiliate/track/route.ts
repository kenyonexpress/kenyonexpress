import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const campaignSlug = request.nextUrl.searchParams.get('campaign')
    if (!campaignSlug) {
      return NextResponse.json({ error: 'campaign parameter required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify campaign exists and is active
    const { data: campaign } = await admin
      .from('affiliate_campaigns')
      .select('id, slug, cookie_days')
      .eq('slug', campaignSlug)
      .eq('active', true)
      .maybeSingle()

    if (!campaign) {
      return NextResponse.json({ error: 'campaign not found or inactive' }, { status: 404 })
    }

    // Record the click
    const { error: clickError } = await admin.from('affiliate_clicks').insert({
      campaign_id: campaign.id,
      user_id: null, // Set when user logs in or places order
    })

    if (clickError) {
      console.error('affiliate click insert failed:', clickError)
      // Don't fail the request, just log it
    }

    // Set cookie
    const response = NextResponse.json({ ok: true })
    const cookieMaxAge = campaign.cookie_days * 24 * 60 * 60
    response.cookies.set('ke_aff', campaignSlug, {
      maxAge: cookieMaxAge,
      path: '/',
      sameSite: 'lax',
    })

    return response
  } catch (error) {
    console.error('affiliate track error:', error)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
