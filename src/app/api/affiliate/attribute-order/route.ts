import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

async function handlePOST(request: NextRequest) {
  try {
    const { order_id, session_id } = await request.json()

    if (!order_id || !session_id) {
      return NextResponse.json(
        { error: 'Missing required fields: order_id, session_id' },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()

    const result = await supabase.rpc('fn_attribute_order_to_affiliate', {
      p_order_id: order_id,
      p_session_id: session_id,
    })

    if (result.error) {
      console.error('Error attributing order:', result.error)
      // Don't fail the order placement for attribution errors
      return NextResponse.json({ success: true, data: { attributed: false } })
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    console.error('Error attributing order to affiliate:', error)
    // Don't fail the order placement for attribution errors
    return NextResponse.json({ success: true, data: { attributed: false } })
  }
}

export const POST = withRequestLog('/api/affiliate/attribute-order', handlePOST)
