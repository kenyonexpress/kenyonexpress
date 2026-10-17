import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateAdminRequest } from '@/server/auth/admin-check'

export const dynamic = 'force-dynamic'

export interface DeliverabilityMetrics {
  timestamp: string
  period: 'last_24h' | 'last_7d' | 'last_30d'
  totalSent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  unsubscribed: number
  deliveryRate: number
  openRate: number
  clickRate: number
  bounceRate: number
  complaintRate: number
  unsubscribeRate: number
  hardBounces: number
  softBounces: number
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || 'last_7d') as 'last_24h' | 'last_7d' | 'last_30d'

    const db = createAdminClient()

    // Calculate time window
    const now = new Date()
    const daysAgo = period === 'last_24h' ? 1 : period === 'last_7d' ? 7 : 30
    const since = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)

    // Get all broadcasts in the period
    const { data: broadcasts, error: broadcastError } = await db
      .from('email_broadcasts')
      .select('id')
      .gte('created_at', since.toISOString())

    if (broadcastError) {
      log.error('deliverability.broadcasts_fetch_failed', { error: broadcastError.message })
      return Response.json({ error: 'Failed to fetch broadcasts' }, { status: 500 })
    }

    if (!broadcasts || broadcasts.length === 0) {
      return Response.json({
        timestamp: new Date().toISOString(),
        period,
        totalSent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        complained: 0,
        unsubscribed: 0,
        deliveryRate: 0,
        openRate: 0,
        clickRate: 0,
        bounceRate: 0,
        complaintRate: 0,
        unsubscribeRate: 0,
        hardBounces: 0,
        softBounces: 0,
      })
    }

    const broadcastIds = broadcasts.map((b) => b.id)

    // Get recipient metrics
    const { data: recipients, error: recipientError } = await db
      .from('email_broadcast_recipients')
      .select('id, status, opened_at, clicked_at')
      .in('broadcast_id', broadcastIds)

    if (recipientError) {
      log.error('deliverability.recipients_fetch_failed', { error: recipientError.message })
      return Response.json({ error: 'Failed to fetch recipients' }, { status: 500 })
    }

    // Get delivery events
    const { data: events, error: eventsError } = await db
      .from('email_delivery_events')
      .select('event_type, bounce_type')
      .in('broadcast_recipient_id', recipients?.map((r) => r.id) || [])

    if (eventsError) {
      log.error('deliverability.events_fetch_failed', { error: eventsError.message })
      return Response.json({ error: 'Failed to fetch delivery events' }, { status: 500 })
    }

    // Calculate metrics
    const metrics = {
      totalSent: recipients?.length || 0,
      delivered: 0,
      opened: recipients?.filter((r) => r.opened_at).length || 0,
      clicked: recipients?.filter((r) => r.clicked_at).length || 0,
      bounced: 0,
      complained: 0,
      unsubscribed: 0,
      hardBounces: 0,
      softBounces: 0,
    }

    for (const r of recipients || []) {
      if (r.status === 'bounced') {
        metrics.bounced++
      } else if (r.status === 'complained') {
        metrics.complained++
      } else if (r.status === 'unsubscribed') {
        metrics.unsubscribed++
      } else if (r.status === 'sent') {
        metrics.delivered++
      }
    }

    for (const e of events || []) {
      if (e.event_type === 'bounced') {
        if (e.bounce_type === 'permanent') {
          metrics.hardBounces++
        } else if (e.bounce_type === 'temporary') {
          metrics.softBounces++
        }
      }
    }

    const total = metrics.totalSent
    const rates = {
      deliveryRate: total > 0 ? Math.round((metrics.delivered / total) * 10000) / 100 : 0,
      openRate: total > 0 ? Math.round((metrics.opened / total) * 10000) / 100 : 0,
      clickRate: total > 0 ? Math.round((metrics.clicked / total) * 10000) / 100 : 0,
      bounceRate: total > 0 ? Math.round((metrics.bounced / total) * 10000) / 100 : 0,
      complaintRate: total > 0 ? Math.round((metrics.complained / total) * 10000) / 100 : 0,
      unsubscribeRate: total > 0 ? Math.round((metrics.unsubscribed / total) * 10000) / 100 : 0,
    }

    const response: DeliverabilityMetrics = {
      timestamp: new Date().toISOString(),
      period,
      ...metrics,
      ...rates,
    }

    return Response.json(response)
  } catch (error) {
    log.error('deliverability.error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
