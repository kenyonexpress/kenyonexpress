import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { isSmsConfigured, sendSmsBroadcast } from '@/lib/sms/broadcast-send'
import { createAdminClient } from '@/lib/supabase/admin'

async function handleGET(_request: Request): Promise<Response> {
  try {
    // Check if SMS is configured
    if (!isSmsConfigured()) {
      log.warn('sms.broadcast.not_configured')
      return Response.json(
        { status: 'not_configured', message: 'SMS service not configured' },
        { status: 200 },
      )
    }

    const db = createAdminClient()

    // Find broadcasts scheduled for now or earlier that haven't been sent
    const { data: pendingBroadcasts, error } = await db
      .from('sms_broadcasts')
      .select('id, segment_name, scheduled_at')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })

    if (error) {
      log.error('sms.broadcast.fetch_pending_failed', { error: error.message })
      return Response.json(
        { status: 'error', message: 'Failed to fetch broadcasts' },
        { status: 500 },
      )
    }

    const results = []

    // Send each broadcast
    for (const broadcast of pendingBroadcasts || []) {
      try {
        const result = await sendSmsBroadcast(broadcast.id)
        results.push({
          broadcastId: broadcast.id,
          segment: broadcast.segment_name,
          sent: result.totalSent,
          failed: result.totalFailed,
          skipped: result.skipped,
        })

        log.info('sms.broadcast.sent_successfully', {
          broadcastId: broadcast.id,
          totalSent: result.totalSent,
        })
      } catch (err) {
        log.error('sms.broadcast.send_error', {
          broadcastId: broadcast.id,
          error: err instanceof Error ? err.message : String(err),
        })
        results.push({
          broadcastId: broadcast.id,
          segment: broadcast.segment_name,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return Response.json({
      status: 'completed',
      broadcasts_processed: results.length,
      results,
    })
  } catch (error) {
    log.error('sms.broadcast.cron_error', { error })
    return Response.json({ status: 'error', message: 'Cron job failed' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/cron/sms-broadcasts', handleGET)
