import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function handleGET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: methods, error } = await supabase
    .from('saved_payment_methods')
    .select('id, last4, card_brand')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    log.error('failed_to_fetch_payment_methods', { err: error })
    return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 })
  }

  return NextResponse.json({ methods: methods || [] })
}

export const GET = withRequestLog('/api/payment-methods', handleGET)
