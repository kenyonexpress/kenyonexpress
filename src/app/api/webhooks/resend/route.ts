import { verifyResendWebhook } from '@/lib/email/resend-webhook'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Webhook endpoint for Resend delivery events (opens, clicks, bounces, complaints).
 * Resend sends signed webhooks; we verify the signature before processing.
 */

export interface ResendWebhookPayload {
  type:
    | 'email.sent'
    | 'email.delivered'
    | 'email.opened'
    | 'email.clicked'
    | 'email.bounced'
    | 'email.complained'
  created_at: string
  data: {
    email_id: string
    from: string
    to: string
    created_at: string
    opened_at?: string
    clicked_at?: string
    bounce_type?: string
    bounce_subtype?: string
    link?: string
    user_agent?: string
    ip_address?: string
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const signature = request.headers.get('x-resend-signature')
    const body = await request.text()

    if (!signature || !body) {
      return Response.json({ error: 'Missing signature or body' }, { status: 400 })
    }

    const isValid = await verifyResendWebhook(body, signature)
    if (!isValid) {
      log.warn('resend_webhook.invalid_signature', { signature: signature.slice(0, 20) })
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(body) as ResendWebhookPayload

    const db = createAdminClient()

    // Map email_id to broadcast_recipient_id by looking up the resend message id
    const { data: recipient, error: recipientError } = await db
      .from('email_broadcast_recipients')
      .select('id, broadcast_id')
      .eq('resend_message_id', payload.data.email_id)
      .single()

    if (recipientError || !recipient) {
      log.warn('resend_webhook.recipient_not_found', { emailId: payload.data.email_id })
      return Response.json({ success: true }) // Still return 200 to acknowledge
    }

    // Map Resend event type to our internal type
    let eventType = 'sent'
    if (payload.type === 'email.opened') eventType = 'opened'
    if (payload.type === 'email.clicked') eventType = 'clicked'
    if (payload.type === 'email.bounced') eventType = 'bounced'
    if (payload.type === 'email.complained') eventType = 'complained'

    // Process the delivery event
    const { error: processError } = await db.rpc('fn_process_delivery_event', {
      p_broadcast_recipient_id: recipient.id,
      p_event_type: eventType,
      p_resend_event_id: payload.data.email_id,
      p_bounce_type: payload.data.bounce_type || null,
      p_bounce_subtype: payload.data.bounce_subtype || null,
      p_complaint_type: null,
      p_clicked_url: eventType === 'clicked' ? payload.data.link : null,
      p_user_agent: payload.data.user_agent || null,
      p_ip_address: payload.data.ip_address || null,
    })

    if (processError) {
      log.error('resend_webhook.process_failed', {
        error: processError.message,
        broadcastRecipientId: recipient.id,
        eventType,
      })
      return Response.json({ error: 'Failed to process event' }, { status: 500 })
    }

    log.info('resend_webhook.processed', {
      broadcastRecipientId: recipient.id,
      eventType,
      email: payload.data.to,
    })

    return Response.json({ success: true })
  } catch (error) {
    log.error('resend_webhook.error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
