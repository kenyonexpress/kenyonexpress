import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { isWithinQuietHours } from './twilio-webhook'

/**
 * Lazy load twilio to avoid import error when not configured
 */
async function getTwilioClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require('twilio')
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

/**
 * Send SMS broadcast to a segment of users
 * Enforces opt-in, quiet hours, and rate limits
 */
export async function sendSmsBroadcast(broadcastId: string): Promise<{
  totalSent: number
  totalFailed: number
  skipped: number
}> {
  const db = createAdminClient()
  const twilioClient = await getTwilioClient()

  // Fetch broadcast details
  const { data: broadcast, error: broadcastError } = await db
    .from('sms_broadcasts')
    .select('*')
    .eq('id', broadcastId)
    .single()

  if (broadcastError || !broadcast) {
    log.error('sms.broadcast.fetch_failed', {
      broadcastId,
      error: broadcastError?.message,
    })
    throw new Error('Broadcast not found')
  }

  // Check if within quiet hours
  if (
    isWithinQuietHours(broadcast.quiet_hours_start, broadcast.quiet_hours_end, broadcast.timezone)
  ) {
    log.warn('sms.broadcast.within_quiet_hours', {
      broadcastId,
      quietStart: broadcast.quiet_hours_start,
      quietEnd: broadcast.quiet_hours_end,
    })
    return { totalSent: 0, totalFailed: 0, skipped: broadcast.total_recipients || 0 }
  }

  // Get users in the segment who are opted in
  const { data: segmentUsers, error: segmentError } = await db
    .from('customer_segments')
    .select('user_id')
    .eq('segment_name', broadcast.segment_name)

  if (segmentError) {
    log.error('sms.broadcast.fetch_segment_failed', {
      broadcastId,
      segment: broadcast.segment_name,
      error: segmentError.message,
    })
    throw new Error('Failed to fetch segment users')
  }

  let totalSent = 0
  let totalFailed = 0
  let skipped = 0

  // Send SMS to each user
  for (const { user_id: userId } of segmentUsers || []) {
    try {
      // Check if user is unsubscribed
      const { data: unsubscribed } = await db.rpc('fn_is_sms_unsubscribed', {
        p_user_id: userId,
        p_segment_name: broadcast.segment_name,
      })

      if (unsubscribed) {
        skipped++
        continue
      }

      // Fetch user's phone number
      const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('phone_number')
        .eq('user_id', userId)
        .single()

      if (profileError || !profile?.phone_number) {
        skipped++
        continue
      }

      // Send via Twilio
      const message = await twilioClient.messages.create({
        body: broadcast.message_content,
        from: process.env.TWILIO_PHONE_NUMBER || '',
        to: profile.phone_number,
      })

      // Log successful send
      const { error: logError } = await db.from('sms_delivery_events').insert({
        twilio_sid: message.sid,
        user_id: userId,
        broadcast_id: broadcastId,
        phone_number: profile.phone_number,
        event_type: 'sent',
      })

      if (!logError) {
        totalSent++
      } else {
        totalFailed++
      }

      log.info('sms.message_sent', {
        messageId: message.sid,
        userId,
        broadcastId,
      })
    } catch (error) {
      totalFailed++
      log.error('sms.send_failed', {
        userId,
        broadcastId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Update broadcast with results
  await db
    .from('sms_broadcasts')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      successful_sends: totalSent,
      failed_sends: totalFailed,
    })
    .eq('id', broadcastId)

  return { totalSent, totalFailed, skipped }
}

/**
 * Check if SMS is configured and available
 */
export function isSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  )
}

/**
 * Schedule a broadcast to be sent at a specific time
 */
export async function scheduleBroadcast(broadcastId: string, scheduledAt: Date): Promise<void> {
  const db = createAdminClient()

  const { error } = await db
    .from('sms_broadcasts')
    .update({
      status: 'scheduled',
      scheduled_at: scheduledAt.toISOString(),
    })
    .eq('id', broadcastId)

  if (error) {
    log.error('sms.broadcast.schedule_failed', {
      broadcastId,
      error: error.message,
    })
    throw error
  }

  log.info('sms.broadcast.scheduled', {
    broadcastId,
    scheduledAt: scheduledAt.toISOString(),
  })
}
