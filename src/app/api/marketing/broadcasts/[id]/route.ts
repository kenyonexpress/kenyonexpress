import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateAdminRequest } from '@/server/auth/admin-check'

export interface BroadcastDetailResponse {
  id: number
  name: string
  description: string | null
  subjectLine: string
  previewText: string | null
  htmlBody: string
  textBody: string
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
  updatedAt: string
  stats?: {
    sentCount: number
    openRate: number
    clickRate: number
    bounceRate: number
    complaintRate: number
    unsubscribeRate: number
  }
}

export async function GET(
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
      .from('email_broadcasts')
      .select(
        'id, name, description, subject_line, preview_text, html_body, text_body, target_segment, status, total_recipients, opened_count, clicked_count, bounced_count, complained_count, unsubscribed_count, created_at, sent_at, send_at, updated_at',
      )
      .eq('id', broadcastId)
      .single()

    if (error) {
      return Response.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    const { data: statsData } = await db.rpc('fn_get_broadcast_stats', {
      p_broadcast_id: broadcastId,
    })

    const stats = statsData && Array.isArray(statsData) && statsData[0] ? statsData[0] : null

    const response: BroadcastDetailResponse = {
      id: broadcast.id,
      name: broadcast.name,
      description: broadcast.description,
      subjectLine: broadcast.subject_line,
      previewText: broadcast.preview_text,
      htmlBody: broadcast.html_body,
      textBody: broadcast.text_body,
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
      updatedAt: broadcast.updated_at,
    }

    if (stats) {
      response.stats = {
        sentCount: stats.sent_count,
        openRate: stats.open_rate || 0,
        clickRate: stats.click_rate || 0,
        bounceRate: stats.bounce_rate || 0,
        complaintRate: stats.complaint_rate || 0,
        unsubscribeRate: stats.unsubscribe_rate || 0,
      }
    }

    return Response.json(response)
  } catch (error) {
    log.error('broadcast.get_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
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

    const body = (await request.json()) as Partial<{
      name: string
      description: string | null
      subjectLine: string
      previewText: string | null
      htmlBody: string
      textBody: string
      status: string
    }>

    const db = createAdminClient()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.subjectLine !== undefined) updateData.subject_line = body.subjectLine
    if (body.previewText !== undefined) updateData.preview_text = body.previewText
    if (body.htmlBody !== undefined) updateData.html_body = body.htmlBody
    if (body.textBody !== undefined) updateData.text_body = body.textBody
    if (body.status !== undefined) updateData.status = body.status

    const { data: broadcast, error } = await db
      .from('email_broadcasts')
      .update(updateData)
      .eq('id', broadcastId)
      .select(
        'id, name, description, subject_line, preview_text, html_body, text_body, target_segment, status, total_recipients, opened_count, clicked_count, bounced_count, complained_count, unsubscribed_count, created_at, sent_at, send_at, updated_at',
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
      subjectLine: broadcast.subject_line,
      previewText: broadcast.preview_text,
      htmlBody: broadcast.html_body,
      textBody: broadcast.text_body,
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
      updatedAt: broadcast.updated_at,
    })
  } catch (error) {
    log.error('broadcast.patch_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
