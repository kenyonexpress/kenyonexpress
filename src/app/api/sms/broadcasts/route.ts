import { CacheControl, withCacheControl } from '@/lib/cache/http'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { validateAdminRequest } from '@/server/auth/admin-check'

export interface SmsBroadcastResponse {
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
}

async function handlePOST(request: Request): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit broadcast creation per admin user
    if (!(await checkRateLimit(`sms-broadcast-create:${user.id}`, 10, 3600))) {
      return Response.json(
        { error: 'Too many broadcast creation requests. Please try again later.' },
        { status: 429 },
      )
    }

    const body = (await request.json()) as Partial<{
      name: string
      description: string | null
      message: string
      segmentName: string
      phoneNumber: string
      scheduledAt: string | null
      quietHoursStart: string | null
      quietHoursEnd: string | null
      quietHoursTz: string
    }>

    const db = createAdminClient()

    // Validate required fields
    if (!body.name || !body.message || !body.segmentName || !body.phoneNumber) {
      return Response.json(
        { error: 'Missing required fields: name, message, segmentName, phoneNumber' },
        { status: 400 },
      )
    }

    // Validate segment name
    const validSegments = ['Champions', 'Loyal', 'Potential', 'At-Risk', 'Dormant']
    if (!validSegments.includes(body.segmentName)) {
      return Response.json(
        { error: `Invalid segment. Must be one of: ${validSegments.join(', ')}` },
        { status: 400 },
      )
    }

    // Create broadcast using RPC
    const { data, error } = await db.rpc('fn_create_sms_broadcast', {
      p_name: body.name,
      p_description: body.description || null,
      p_phone_number: body.phoneNumber,
      p_message: body.message,
      p_segment_name: body.segmentName,
      p_scheduled_at: body.scheduledAt || null,
      p_quiet_hours_start: body.quietHoursStart || null,
      p_quiet_hours_end: body.quietHoursEnd || null,
    })

    if (error || !data) {
      log.error('broadcast.creation_failed', { error: error?.message || 'Unknown error' })
      return Response.json({ error: 'Failed to create broadcast' }, { status: 500 })
    }

    log.info('broadcast.created', { broadcastId: data.id, recipientCount: data.recipient_count })

    return Response.json({ id: data.id, recipientCount: data.recipient_count }, { status: 201 })
  } catch (error) {
    log.error('broadcast.post_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleGET(request: Request): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = createAdminClient()
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const limit = Number.parseInt(url.searchParams.get('limit') || '50')
    const offset = Number.parseInt(url.searchParams.get('offset') || '0')

    let query = db
      .from('sms_broadcasts')
      .select(
        'id, name, description, message, segment_name, status, total_recipients, sent_count, delivered_count, failed_count, bounced_count, opted_out_count, phone_number, created_at, scheduled_at, sent_at, updated_at, quiet_hours_start, quiet_hours_end, quiet_hours_tz',
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (
      status &&
      ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'].includes(status)
    ) {
      query = query.eq('status', status)
    }

    const { data: broadcasts, error } = await query

    if (error) {
      log.error('broadcasts.fetch_failed', { error: error.message })
      return Response.json({ error: 'Failed to fetch broadcasts' }, { status: 500 })
    }

    const response: SmsBroadcastResponse[] = (broadcasts || []).map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      message: b.message,
      segmentName: b.segment_name,
      status: b.status,
      totalRecipients: b.total_recipients,
      sentCount: b.sent_count,
      deliveredCount: b.delivered_count,
      failedCount: b.failed_count,
      bouncedCount: b.bounced_count,
      optedOutCount: b.opted_out_count,
      phoneNumber: b.phone_number,
      createdAt: b.created_at,
      scheduledAt: b.scheduled_at,
      sentAt: b.sent_at,
      updatedAt: b.updated_at,
      quietHoursStart: b.quiet_hours_start,
      quietHoursEnd: b.quiet_hours_end,
      quietHoursTz: b.quiet_hours_tz,
    }))

    return Response.json(response)
  } catch (error) {
    log.error('broadcasts.get_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/sms/broadcasts', handlePOST)
export const GET = withCacheControl(
  CacheControl.private,
  withRequestLog('/api/sms/broadcasts', handleGET),
)
