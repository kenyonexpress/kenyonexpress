import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export interface UnsubscribeRequest {
  segmentName?: string
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Support both authenticated users and service role
    const authHeader = request.headers.get('authorization')
    const isServiceRole = authHeader?.startsWith('Bearer ') && authHeader.includes('service_role')

    let db: ReturnType<typeof createAdminClient> | ReturnType<typeof createClient>
    let userId: string | null = null

    if (isServiceRole) {
      // Service role can unsubscribe anyone (used by webhooks)
      db = createAdminClient()
      const body = (await request.json()) as UnsubscribeRequest & { userId: string }
      userId = body.userId
    } else {
      // Regular user unsubs themselves
      db = createClient()
      const { data: authData } = await db.auth.getUser()
      if (!authData.user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authData.user.id
    }

    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 })
    }

    const body = (await request.json()) as UnsubscribeRequest
    const segmentName = body.segmentName || null

    const { error } = await db.rpc('fn_unsubscribe_from_segment', {
      p_user_id: userId,
      p_segment_name: segmentName,
      p_source: 'unsubscribe_link',
      p_reason: null,
    })

    if (error) {
      log.error('unsubscribe.failed', { error: error.message, userId, segmentName })
      return Response.json({ error: 'Failed to unsubscribe' }, { status: 500 })
    }

    log.info('unsubscribe.success', { userId, segmentName })

    return Response.json({
      success: true,
      message: segmentName
        ? `Unsubscribed from ${segmentName}`
        : 'Unsubscribed from all marketing emails',
    })
  } catch (error) {
    log.error('unsubscribe.error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
