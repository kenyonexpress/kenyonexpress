import { headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { formatSearchReport, generateSearchReport } from '@/lib/search/report'
import { bearerMatches } from '@/lib/security/constant-time'

async function handleGET(_request: NextRequest) {
  try {
    const headersList = await headers()
    const cronSecret = process.env.CRON_SECRET
    const authHeader = headersList.get('authorization')

    if (!cronSecret || cronSecret.length === 0) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    if (!bearerMatches(authHeader, cronSecret)) {
      log.warn('search.report_unauthorized')
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const report = await generateSearchReport()
    if (!report) {
      return NextResponse.json({ ok: false, error: 'no_data' }, { status: 404 })
    }

    const formatted = formatSearchReport(report)
    log.info('search.report_generated', {
      week_start: report.week_start,
      searches: report.total_searches,
    })

    // Report ready for delivery via notification service (queue to notification_outbox table for Resend)
    return NextResponse.json({ ok: true, report, formatted_text: formatted })
  } catch (error) {
    log.error('search.cron_threw', { reason: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/cron/search-report', handleGET)
