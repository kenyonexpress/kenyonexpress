import { type NextRequest, NextResponse } from 'next/server'

import { sendPushToUsers } from '@/lib/push/send'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // Find vouchers expiring in the next 24 hours that haven't been notified
    const now = new Date()
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: vouchersAboutToExpire } = await admin
      .from('vouchers')
      .select('id, user_id, code')
      .lt('expires_at', next24h.toISOString())
      .gt('expires_at', now.toISOString())
      .is('push_expiry_notified_at', null)

    let notified = 0

    if (vouchersAboutToExpire && vouchersAboutToExpire.length > 0) {
      // Group by user and send notifications
      const userVouchers = new Map<string, typeof vouchersAboutToExpire>()
      for (const voucher of vouchersAboutToExpire) {
        if (!userVouchers.has(voucher.user_id)) {
          userVouchers.set(voucher.user_id, [])
        }
        const userList = userVouchers.get(voucher.user_id)
        if (userList) {
          userList.push(voucher)
        }
      }

      for (const [userId, vouchers] of userVouchers) {
        if (vouchers.length === 0) continue
        const voucherCode = vouchers[0]?.code
        const count = vouchers.length
        if (!voucherCode) continue

        await sendPushToUsers([userId], {
          title: 'קופון שלך עומד להתפוג',
          body:
            count === 1
              ? `קופון ${voucherCode} יתפוג בעוד 24 שעות. קח זוג עכשיו!`
              : `${count} קופונים שלך יתפוגו בעוד 24 שעות. קח דיל עכשיו!`,
          data: {
            url: '/account/vouchers',
          },
        })

        // Mark as notified
        const voucherIds = vouchers.map((v) => v.id)
        await admin
          .from('vouchers')
          .update({ push_expiry_notified_at: now.toISOString() })
          .in('id', voucherIds)

        notified++
      }
    }

    return NextResponse.json({ notified })
  } catch (error) {
    console.error('Error sending voucher expiry notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
