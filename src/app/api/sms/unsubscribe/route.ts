import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<{
      segmentName: string | null
      global: boolean
    }>

    // Try authenticated user first
    const userClient = await createClient()
    const {
      data: { user },
    } = await userClient.auth.getUser()

    let userId: string | null = null
    let useServiceRole = false

    if (user) {
      userId = user.id
    } else {
      // Try service role with authorization header
      const authHeader = request.headers.get('authorization')
      if (
        authHeader?.startsWith('Bearer ') &&
        authHeader.substring(7) === process.env.CRON_SECRET
      ) {
        useServiceRole = true
      } else {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    if (!userId && !useServiceRole) {
      return Response.json({ error: 'User ID not available' }, { status: 400 })
    }

    const db = useServiceRole ? createAdminClient() : userClient

    // Determine if global or segment-specific unsubscribe
    const segmentName = body.global ? null : body.segmentName || null

    if (userId) {
      // User unsubscribe
      const { error } = await db.from('sms_unsubscribes').upsert(
        {
          user_id: userId,
          phone_number: '', // Placeholder - phone should be fetched from profile
          segment_name: segmentName,
          reason: 'user_request',
          unsubscribed_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,segment_name',
        },
      )

      if (error) {
        log.error('sms.unsubscribe_failed', { error: error.message, userId, segmentName })
        return Response.json({ error: 'Failed to unsubscribe' }, { status: 500 })
      }

      log.info('sms.user_unsubscribed', { userId, segmentName })
      return Response.json({ success: true, message: 'Unsubscribed from SMS' }, { status: 200 })
    }

    return Response.json({ error: 'Insufficient authorization' }, { status: 401 })
  } catch (error) {
    log.error('sms.unsubscribe_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
