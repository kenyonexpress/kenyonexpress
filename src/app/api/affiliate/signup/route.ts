import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

async function handlePOST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { commission_rate } = await request.json()

    const result = await supabase.rpc('fn_create_affiliate', {
      p_commission_rate: commission_rate || 500, // default 5%
    })

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    console.error('Error creating affiliate account:', error)
    return NextResponse.json({ error: 'Failed to create affiliate account' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/affiliate/signup', handlePOST)
