import { bucketSales, totalsOf } from '@/lib/analytics/aggregate'
import { contactEmail } from '@/lib/contact-address'
import { sendEmail } from '@/lib/growth/resend'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSalesLines } from '@/server/analytics/queries'
import { OFF_PAGE } from '@/styles/tokens'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The weekly ops digest: one Hebrew mail to the operator address, Friday
 * morning (see scripts/cron-jobs.json). Everything in it is a number the
 * admin panel already computes -- the digest exists so the numbers arrive
 * without anyone remembering to look.
 *
 * Direct Resend send, NOT the outbox: the outbox's kind CHECK is a deployed
 * constraint and this is operator mail to one known address -- the dedupe
 * and retry machinery buyer mail needs would add a migration for no risk
 * being retired. If Resend is down, next Friday's digest still arrives.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const [{ lines }, dead, expiring] = await Promise.all([
    loadSalesLines(7),
    admin
      .from('notification_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dead'),
    admin
      .from('vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'issued')
      .lte('expires_at', new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()),
  ])

  const totals = totalsOf(bucketSales(lines, 'day'))
  const rows: [string, string][] = [
    ['הזמנות ששולמו', String(totals.orders)],
    ['פריטים', String(totals.items)],
    ['GMV', `₪${totals.gmvIls.toLocaleString('he-IL')}`],
    ['הכנסות פלטפורמה', `₪${totals.platformRevenueIls.toLocaleString('he-IL')}`],
    ['חלק ספקים', `₪${totals.supplierDueIls.toLocaleString('he-IL')}`],
    ['מיילים במצב dead', String(dead.count ?? 0)],
    ['שוברים שפגים בשבוע הקרוב', String(expiring.count ?? 0)],
  ]

  const html = `<div dir="rtl" style="font-family:Heebo,Arial,Helvetica,sans-serif">
    <h2>סיכום שבועי — KenyonExpress</h2>
    <table style="border-collapse:collapse">${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:${OFF_PAGE.ink}">${label}</td><td style="padding:4px 0;font-weight:bold">${value}</td></tr>`,
      )
      .join('')}</table>
    <p style="color:${OFF_PAGE.muted};font-size:12px">שבעת הימים האחרונים · נשלח אוטומטית מ-cron ‏weekly-digest</p>
  </div>`

  const result = await sendEmail({
    to: contactEmail(),
    subject: `סיכום שבועי: ${totals.orders} הזמנות, ₪${Math.round(totals.gmvIls).toLocaleString('he-IL')} GMV`,
    html,
    tag: 'weekly-digest',
  })

  if (!result.ok && !('skipped' in result && result.skipped)) {
    log.error('weekly_digest.send_failed', {})
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true, sent: result.ok === true, orders: totals.orders })
}

export const GET = withRequestLog('/api/cron/weekly-digest', handleGET)
