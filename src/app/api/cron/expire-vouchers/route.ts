import { createAdminClient } from '@/lib/supabase/admin'
import { isEscrowFlowEnabled, refundEscrowForOrderItem } from '@/server/payments/escrow'
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

  // Escrow leg: a hold whose vouchers all expired without redemption is closed
  // toward the customer (the sweep RPC already credited the wallet).
  let escrowRefunds = 0
  if (isEscrowFlowEnabled()) {
    const { data: holds } = await admin
      .from('order_escrow_holds')
      .select('order_item_id')
      .eq('status', 'held')
      .limit(200)
    for (const hold of holds ?? []) {
      const orderItemId = hold.order_item_id as string
      const { data: vouchers } = await admin
        .from('vouchers')
        .select('status')
        .eq('order_item_id', orderItemId)
      const all = vouchers ?? []
      if (all.length === 0 || !all.every((v) => v.status === 'expired')) continue
      const refunded = await refundEscrowForOrderItem(admin, orderItemId, 'expired')
      if (refunded.ok && !refunded.replay) escrowRefunds += 1
    }
  }

  return NextResponse.json({ ok: true, result: data, escrow_refunds: escrowRefunds })
}
