import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Voucher expiry sweep (issued -> expired past expires_at). Scan-time safety
 * does not depend on this job: the redeem RPC re-checks expiry inside its
 * atomic UPDATE. This keeps statuses truthful for the customer page and admin.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('expire_vouchers', { p_limit: 1000 })
  if (error) {
    console.error('expire_vouchers failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, result: data })
}
