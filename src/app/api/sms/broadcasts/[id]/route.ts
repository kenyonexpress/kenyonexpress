import { CacheControl, withCacheControl } from '@/lib/cache/http'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { validateAdminRequest } from '@/server/auth/admin-check'

export interface SmsBroadcastDetailResponse {
  id: number
  name: string
  description: string | null
  message: string
  segmentName: string
  status: string
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  failedCount: number
  bouncedCount: number
  optedOutCount: number
  phoneNumber: string
  createdAt: string
  scheduledAt: string | null
  sentAt: string | null
  updatedAt: string
  quietHoursStart: string | null
  quietHoursEnd: string | null
  quietHoursTz: string
  stats?: {
    deliveryRate: number
    failureRate: number
    bounceRate: number
    optoutRate: number
  }
}

async function handleGET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const broadcastId = Number.parseInt(id)
    if (!broadcastId) {
      return Response.json({ error: 'Invalid broadcast ID' }, { status: 400 })
    }

    const db = createAdminClient()

    const { data: broadcast, error } = await db
      .from('sms_broadcasts')
      .select(
        'id, name, description, message, segment_name, status, total_recipients, sent_count, delivered_count, failed_count, bounced_count, opted_out_count, phone_number, created_at, scheduled_at, sent_at, updated_at, quiet_hours_start, quiet_hours_end, quiet_hours_tz',
      )
      .eq('id', broadcastId)
      .single()

    if (error) {
      return Response.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    const { data: statsData, error: statsError } = await db.rpc('fn_get_sms_broadcast_stats', {
      p_broadcast_id: broadcastId,
    })
    // The detail is still worth returning without its rates; say so in the log.
    if (statsError) log.warn('sms.broadcast.stats_failed', { reason: statsError.message })

    const stats =
      statsData && Array.isArray(statsData) && statsData[0]
        ? {
            deliveryRate: statsData[0].delivery_rate || 0,
            failureRate: statsData[0].failure_rate || 0,
            bounceRate: statsData[0].bounce_rate || 0,
            optoutRate: statsData[0].optout_rate || 0,
          }
        : undefined

    const response: SmsBroadcastDetailResponse = {
      id: broadcast.id,
      name: broadcast.name,
      description: broadcast.description,
      message: broadcast.message,
      segmentName: broadcast.segment_name,
      status: broadcast.status,
      totalRecipients: broadcast.total_recipients,
      sentCount: broadcast.sent_count,
      deliveredCount: broadcast.delivered_count,
      failedCount: broadcast.failed_count,
      bouncedCount: broadcast.bounced_count,
      optedOutCount: broadcast.opted_out_count,
      phoneNumber: broadcast.phone_number,
      createdAt: broadcast.created_at,
      scheduledAt: broadcast.scheduled_at,
      sentAt: broadcast.sent_at,
      updatedAt: broadcast.updated_at,
      quietHoursStart: broadcast.quiet_hours_start,
      quietHoursEnd: broadcast.quiet_hours_end,
      quietHoursTz: broadcast.quiet_hours_tz,
    }

    if (stats) {
      response.stats = stats
    }

    return Response.json(response)
  } catch (error) {
    log.error('broadcast.get_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit broadcast updates per admin user
    if (!(await checkRateLimit(`sms-broadcast-update:${user.id}`, 20, 3600))) {
      return Response.json(
        { error: 'Too many broadcast update requests. Please try again later.' },
        { status: 429 },
      )
    }

    const { id } = await params
    const broadcastId = Number.parseInt(id)
    if (!broadcastId) {
      return Response.json({ error: 'Invalid broadcast ID' }, { status: 400 })
    }

    const body = (await request.json()) as Partial<{
      name: string
      description: string | null
      message: string
      status: string
      quietHoursStart: string | null
      quietHoursEnd: string | null
      quietHoursTz: string
    }>

    const db = createAdminClient()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.message !== undefined) updateData.message = body.message
    if (body.status !== undefined) updateData.status = body.status
    if (body.quietHoursStart !== undefined) updateData.quiet_hours_start = body.quietHoursStart
    if (body.quietHoursEnd !== undefined) updateData.quiet_hours_end = body.quietHoursEnd
    if (body.quietHoursTz !== undefined) updateData.quiet_hours_tz = body.quietHoursTz

    const { data: broadcast, error } = await db
      .from('sms_broadcasts')
      .update(updateData)
      .eq('id', broadcastId)
      .select(
        'id, name, description, message, segment_name, status, total_recipients, sent_count, delivered_count, failed_count, bounced_count, opted_out_count, phone_number, created_at, scheduled_at, sent_at, updated_at, quiet_hours_start, quiet_hours_end, quiet_hours_tz',
      )
      .single()

    if (error) {
      log.error('broadcast.update_failed', { error: error.message, broadcastId })
      return Response.json({ error: 'Failed to update broadcast' }, { status: 500 })
    }

    log.info('broadcast.updated', { broadcastId, changes: Object.keys(updateData) })

    return Response.json({
      id: broadcast.id,
      name: broadcast.name,
      description: broadcast.description,
      message: broadcast.message,
      segmentName: broadcast.segment_name,
      status: broadcast.status,
      totalRecipients: broadcast.total_recipients,
      sentCount: broadcast.sent_count,
      deliveredCount: broadcast.delivered_count,
      failedCount: broadcast.failed_count,
      bouncedCount: broadcast.bounced_count,
      optedOutCount: broadcast.opted_out_count,
      phoneNumber: broadcast.phone_number,
      createdAt: broadcast.created_at,
      scheduledAt: broadcast.scheduled_at,
      sentAt: broadcast.sent_at,
      updatedAt: broadcast.updated_at,
      quietHoursStart: broadcast.quiet_hours_start,
      quietHoursEnd: broadcast.quiet_hours_end,
      quietHoursTz: broadcast.quiet_hours_tz,
    })
  } catch (error) {
    log.error('broadcast.patch_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withCacheControl(
  CacheControl.private,
  withRequestLog('/api/sms/broadcasts/[id]', handleGET),
)
export const PATCH = withRequestLog('/api/sms/broadcasts/[id]', handlePATCH)
