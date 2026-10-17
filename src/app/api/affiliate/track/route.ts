import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

async function handlePOST(request: NextRequest) {
  try {
    const {
      affiliate_code,
      session_id,
      product_id,
      category_id,
      ip_address,
      user_agent,
      referrer,
    } = await request.json()

    if (!affiliate_code || !session_id) {
      return NextResponse.json(
        { error: 'Missing required fields: affiliate_code, session_id' },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()

    const result = await supabase.rpc('fn_record_affiliate_click', {
      p_affiliate_code: affiliate_code,
      p_session_id: session_id,
      p_product_id: product_id || null,
      p_category_id: category_id || null,
      p_ip_address: ip_address || null,
      p_user_agent: user_agent || null,
      p_referrer: referrer || null,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    console.error('Error tracking affiliate click:', error)
    return NextResponse.json({ error: 'Failed to track click' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/affiliate/track', handlePOST)
