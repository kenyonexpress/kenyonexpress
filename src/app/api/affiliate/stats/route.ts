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

    const result = await supabase.rpc('fn_get_affiliate_stats')

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }

    // Return first row if exists, otherwise null
    const stats = result.data && result.data.length > 0 ? result.data[0] : null

    return NextResponse.json({ success: true, data: stats })
  } catch (error) {
    console.error('Error fetching affiliate stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/affiliate/stats', handleGET)
