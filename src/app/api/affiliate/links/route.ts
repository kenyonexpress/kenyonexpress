import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

async function handleGET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get affiliate account with links
    const { data: affiliate, error: affiliateError } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (affiliateError || !affiliate) {
      return NextResponse.json({ error: 'Affiliate account not found' }, { status: 404 })
    }

    // Get affiliate links
    const { data: links, error: linksError } = await supabase
      .from('affiliate_links')
      .select('*')
      .eq('affiliate_id', affiliate.id)

    if (linksError) {
      return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: { affiliate, links } })
  } catch (error) {
    console.error('Error fetching affiliate links:', error)
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 })
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { utm_campaign, name } = await request.json()

    // Get affiliate account
    const { data: affiliate, error: affiliateError } = await supabase
      .from('affiliates')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (affiliateError || !affiliate) {
      return NextResponse.json({ error: 'Affiliate account not found' }, { status: 404 })
    }

    // Create new tracking link
    const { data: link, error: linkError } = await supabase
      .from('affiliate_links')
      .insert({
        affiliate_id: affiliate.id,
        utm_campaign,
        name,
      })
      .select()
      .single()

    if (linkError) {
      return NextResponse.json({ error: 'Failed to create link' }, { status: 500 })
    }

    // Generate tracking URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kenyonexpress.co.il'
    const trackingUrl = `${baseUrl}?aff=${affiliate.id}&campaign=${encodeURIComponent(utm_campaign || '')}`

    return NextResponse.json({
      success: true,
      data: {
        ...link,
        trackingUrl,
      },
    })
  } catch (error) {
    console.error('Error creating affiliate link:', error)
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/affiliate/links', handleGET)
export const POST = withRequestLog('/api/affiliate/links', handlePOST)
