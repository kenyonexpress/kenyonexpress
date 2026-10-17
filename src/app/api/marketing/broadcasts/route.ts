import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateAdminRequest } from '@/server/auth/admin-check'

export interface CreateBroadcastRequest {
  name: string
  description?: string
  subjectLine: string
  previewText?: string
  htmlBody: string
  textBody: string
  targetSegment: string
  sendAt?: string
}

export interface BroadcastResponse {
  id: number
  name: string
  description: string | null
  subjectLine: string
  previewText: string | null
  targetSegment: string
  status: string
  totalRecipients: number
  openedCount: number
  clickedCount: number
  bouncedCount: number
  complainedCount: number
  unsubscribedCount: number
  createdAt: string
  sentAt: string | null
  sendAt: string | null
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as CreateBroadcastRequest

    if (
      !body.name ||
      !body.subjectLine ||
      !body.htmlBody ||
      !body.textBody ||
      !body.targetSegment
    ) {
      return Response.json(
        { error: 'Missing required fields: name, subjectLine, htmlBody, textBody, targetSegment' },
        { status: 400 },
      )
    }

    const db = createAdminClient()

    const { data, error } = await db.rpc('fn_create_broadcast', {
      p_name: body.name,
      p_description: body.description || null,
      p_subject_line: body.subjectLine,
      p_preview_text: body.previewText || null,
      p_html_body: body.htmlBody,
      p_text_body: body.textBody,
      p_target_segment: body.targetSegment,
      p_send_at: body.sendAt || null,
    })

    if (error) {
      log.error('broadcast.create_failed', { error: error.message })
      return Response.json({ error: 'Failed to create broadcast' }, { status: 500 })
    }

    const broadcastId = data as number

    const { data: broadcast, error: fetchError } = await db
      .from('email_broadcasts')
      .select(
        'id, name, description, subject_line, preview_text, target_segment, status, total_recipients, opened_count, clicked_count, bounced_count, complained_count, unsubscribed_count, created_at, sent_at, send_at',
      )
      .eq('id', broadcastId)
      .single()

    if (fetchError) {
      log.error('broadcast.fetch_failed', { error: fetchError.message, broadcastId })
      return Response.json({ error: 'Failed to fetch broadcast' }, { status: 500 })
    }

    log.info('broadcast.created', { broadcastId, segment: body.targetSegment })

    return Response.json(
      {
        id: broadcast.id,
        name: broadcast.name,
        description: broadcast.description,
        subjectLine: broadcast.subject_line,
        previewText: broadcast.preview_text,
        targetSegment: broadcast.target_segment,
        status: broadcast.status,
        totalRecipients: broadcast.total_recipients,
        openedCount: broadcast.opened_count,
        clickedCount: broadcast.clicked_count,
        bouncedCount: broadcast.bounced_count,
        complainedCount: broadcast.complained_count,
        unsubscribedCount: broadcast.unsubscribed_count,
        createdAt: broadcast.created_at,
        sentAt: broadcast.sent_at,
        sendAt: broadcast.send_at,
      },
      { status: 201 },
    )
  } catch (error) {
    log.error('broadcast.post_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const segment = searchParams.get('segment')
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50'), 100)
    const offset = Number.parseInt(searchParams.get('offset') || '0')

    const db = createAdminClient()

    let query = db
      .from('email_broadcasts')
      .select(
        'id, name, description, subject_line, preview_text, target_segment, status, total_recipients, opened_count, clicked_count, bounced_count, complained_count, unsubscribed_count, created_at, sent_at, send_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }
    if (segment) {
      query = query.eq('target_segment', segment)
    }

    const { data: broadcasts, error, count } = await query

    if (error) {
      log.error('broadcasts.list_failed', { error: error.message })
      return Response.json({ error: 'Failed to fetch broadcasts' }, { status: 500 })
    }

    const response = broadcasts.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      subjectLine: b.subject_line,
      previewText: b.preview_text,
      targetSegment: b.target_segment,
      status: b.status,
      totalRecipients: b.total_recipients,
      openedCount: b.opened_count,
      clickedCount: b.clicked_count,
      bouncedCount: b.bounced_count,
      complainedCount: b.complained_count,
      unsubscribedCount: b.unsubscribed_count,
      createdAt: b.created_at,
      sentAt: b.sent_at,
      sendAt: b.send_at,
    }))

    return Response.json({
      broadcasts: response,
      total: count,
      limit,
      offset,
    })
  } catch (error) {
    log.error('broadcasts.get_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
