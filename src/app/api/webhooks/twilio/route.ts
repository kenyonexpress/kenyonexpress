import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { isSmsStopKeyword, verifyTwilioWebhook } from '@/lib/sms/twilio-webhook'
import { createAdminClient } from '@/lib/supabase/admin'

// Webhook uses timingSafeEqual (imported for type checking the constant-time comparison)

async function handlePOST(request: Request): Promise<Response> {
  try {
    const signature = request.headers.get('x-twilio-signature') || ''
    const url = new URL(request.url).toString().split('?')[0] // Remove query params

    // Parse form data
    const formData = await request.formData()
    const data: Record<string, string> = {}
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        data[key] = value
      }
    }

    // Verify webhook signature
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      log.warn('twilio.webhook.no_auth_token')
      return Response.json({ error: 'Webhook not configured' }, { status: 403 })
    }

    const isValid = await verifyTwilioWebhook(url, data, signature, authToken || '')

    if (!isValid) {
      log.warn('twilio.webhook.signature_invalid', { signature, messageId: data.MessageSid })
      return Response.json({ error: 'Invalid signature' }, { status: 403 })
    }

    const db = createAdminClient()

    // Handle message status callbacks (sent, delivered, failed, bounced)
    const messageStatus = data.MessageStatus
    const messageSid = data.MessageSid

    if (messageStatus && messageSid) {
      // Map Twilio status to our status
      const statusMap: Record<string, string> = {
        sent: 'sent',
        delivered: 'delivered',
        failed: 'failed',
        bounced: 'bounced',
      }

      const eventType = statusMap[messageStatus]
      if (eventType) {
        // Process delivery event
        const errorCode = data.ErrorCode || null
        const errorMessage = data.ErrorMessage || null

        const { error } = await db.rpc('fn_process_sms_delivery_event', {
          p_twilio_sid: messageSid,
          p_event_type: eventType,
          p_error_code: errorCode,
          p_error_message: errorMessage,
        })

        if (error) {
          log.error('twilio.delivery_event_failed', { error: error.message, messageSid })
          return Response.json({ error: 'Failed to process delivery event' }, { status: 500 })
        }

        log.info('twilio.delivery_event_processed', { messageSid, eventType })
        return Response.json({ success: true }, { status: 200 })
      }
    }

    // Handle incoming SMS (STOP keyword)
    const incomingMessage = data.Body
    const fromNumber = data.From

    if (incomingMessage && fromNumber) {
      if (isSmsStopKeyword(incomingMessage)) {
        // Process STOP keyword - user wants to unsubscribe
        // Find user by phone number and mark as unsubscribed
        const { data: profiles, error: profileError } = await db
          .from('profiles')
          .select('user_id, phone_number')
          .eq('phone_number', fromNumber)
          .limit(1)

        if (profileError) {
          log.error('twilio.stop_keyword_profile_lookup_failed', {
            error: profileError.message,
            fromNumber,
          })
          return Response.json({ success: false }, { status: 200 })
        }

        if (profiles && profiles.length > 0) {
          const profile = profiles[0]
          if (profile?.user_id) {
            const { error: unsubError } = await db.from('sms_unsubscribes').upsert(
              {
                user_id: profile.user_id,
                phone_number: fromNumber,
                segment_name: null, // Global unsubscribe
                reason: 'stop_keyword',
                unsubscribed_at: new Date().toISOString(),
              },
              {
                onConflict: 'user_id,segment_name',
              },
            )

            if (unsubError) {
              log.error('twilio.stop_keyword_unsubscribe_failed', {
                error: unsubError.message,
                userId: profile.user_id,
              })
              return Response.json({ success: false }, { status: 200 })
            }

            log.info('twilio.stop_keyword_processed', { userId: profile.user_id, fromNumber })
          }
        }
      }

      // Always return 200 to Twilio to acknowledge receipt
      return Response.json({ success: true }, { status: 200 })
    }

    return Response.json({ success: true }, { status: 200 })
  } catch (error) {
    log.error('twilio.webhook_error', { error })
    // Return 200 to prevent Twilio from retrying
    return Response.json({ error: 'Webhook processed with error' }, { status: 200 })
  }
}

export const POST = withRequestLog('/api/webhooks/twilio', handlePOST)
