import { type NextRequest, NextResponse } from 'next/server'

import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'

async function handlePOST(request: NextRequest) {
  try {
    const ip = await getClientIp()
    if (!(await checkRateLimit(`search-click:${ip}`, 600, 300))) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const body = await request.json()
    const { term, productId, position } = body

    if (!term || typeof term !== 'string') {
      return NextResponse.json({ error: 'missing_term' }, { status: 400 })
    }
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'missing_product_id' }, { status: 400 })
    }
    if (!position || typeof position !== 'number' || position < 1) {
      return NextResponse.json({ error: 'invalid_position' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc('fn_record_search_click', {
      p_term: term,
      p_product_id: productId,
      p_position: position,
    })

    if (error) {
      log.warn('search.click_record_failed', { reason: error.message })
      return NextResponse.json({ ok: true, recorded: false })
    }

    return NextResponse.json({ ok: true, recorded: true })
  } catch (error) {
    log.warn('search.click_record_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({ ok: true, recorded: false })
  }
}

export const POST = withRequestLog('/api/search/record-click', handlePOST)
