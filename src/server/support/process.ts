import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import { classifyMessage, shouldAutoRespond } from '@/server/support/classify'
import { forwardInboundToOwner } from '@/server/whatsapp/forward-to-owner'
import { createClient } from '@supabase/supabase-js'

export interface ProcessSupportMessageInput {
  customer_email: string
  customer_name: string
  customer_phone?: string
  message_body: string
  subject?: string
  source?: 'contact_form' | 'whatsapp' | 'email'
}

export interface ProcessResult {
  message_id: string
  auto_responded: boolean
  owner_notified: boolean
  error?: string
}

/**
 * Process a single support message:
 * 1. Classify it (category + complexity)
 * 2. Send auto-response if simple
 * 3. Route to owner (email + WhatsApp) if complex
 */
export async function processSupportMessage(
  input: ProcessSupportMessageInput,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): Promise<ProcessResult> {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL || '',
    env.SUPABASE_SERVICE_ROLE_KEY || '',
  )

  try {
    // Classify the message
    const classification = classifyMessage(input.message_body, input.customer_name, input.subject)

    // Insert the message with classification
    const { data: message, error: insertError } = await supabase
      .from('support_messages')
      .insert({
        customer_email: input.customer_email,
        customer_name: input.customer_name,
        customer_phone: input.customer_phone,
        message_body: input.message_body,
        subject: input.subject,
        category: classification.category,
        is_complex: classification.is_complex,
        complexity_score: classification.complexity_score,
        classification_reason: classification.reason,
        source: input.source || 'contact_form',
        status: 'new',
      })
      .select('id')
      .single()

    if (insertError || !message) {
      throw new Error(`Failed to insert message: ${insertError?.message}`)
    }

    const messageId = message.id
    let autoResponded = false
    let ownerNotified = false

    // Decide: auto-respond vs. route to owner
    if (shouldAutoRespond(classification, classification.category)) {
      // Get auto-response template
      const { data: template } = await supabase
        .from('support_auto_responses')
        .select('subject_he, body_he')
        .eq('category', classification.category)
        .eq('enabled', true)
        .single()

      if (template) {
        // Send auto-response email
        const emailResult = await sendEmail({
          to: input.customer_email,
          subject: template.subject_he,
          html: `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;text-align:right">
            ${template.body_he.replace(/\n/g, '<br/>')}
            <p style="margin-top:24px;font-size:12px;color:#666">
              פנייה ID: ${messageId.slice(0, 8)}
            </p>
          </div>`,
          text: `${template.body_he}\n\nפנייה ID: ${messageId.slice(0, 8)}`,
          idempotencyKey: `auto-response:${messageId}`,
        })

        if (emailResult.ok) {
          autoResponded = true
          await supabase
            .from('support_messages')
            .update({
              status: 'auto_responded',
              auto_response_sent_at: new Date().toISOString(),
              auto_response_template: classification.category,
            })
            .eq('id', messageId)
        }
      }
    }

    // Route complex messages or those without auto-response to owner
    if (classification.is_complex || !autoResponded) {
      try {
        const forward = await forwardInboundToOwner(
          {
            phone: input.customer_phone || input.customer_email,
            ticketId: messageId,
            body: input.message_body.slice(0, 500), // Truncate for WhatsApp
            intent: classification.category,
          },
          env,
        )

        if (forward.whatsapp === 'sent' || forward.email === 'sent') {
          ownerNotified = true
          await supabase
            .from('support_messages')
            .update({
              status: 'owner_notified',
              owner_notified_at: new Date().toISOString(),
            })
            .eq('id', messageId)

          log.info('support.owner_notified', {
            messageId,
            category: classification.category,
            whatsapp: forward.whatsapp,
            email: forward.email,
          })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'unknown error'
        log.error('support.owner_notify_failed', { messageId, error: errorMsg })
      }
    }

    return {
      message_id: messageId,
      auto_responded: autoResponded,
      owner_notified: ownerNotified,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'unknown error'
    log.error('support.process_failed', { ...input, error: errorMsg })
    throw err
  }
}

/**
 * Batch process all unprocessed messages.
 * Called by cron endpoint to classify and route messages.
 */
export async function processPendingSupportMessages(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL || '',
    env.SUPABASE_SERVICE_ROLE_KEY || '',
  )

  const runId = crypto.randomUUID()

  try {
    // Record the run
    const { error: runInsertError } = await supabase.from('support_classifier_runs').insert({
      id: runId,
      started_at: new Date().toISOString(),
    })

    if (runInsertError) {
      throw new Error(`Failed to create classifier run: ${runInsertError.message}`)
    }

    // Fetch new messages
    const { data: messages, error: fetchError } = (await supabase
      .from('support_messages' as any)
      .select('*')
      .eq('status', 'new')
      .order('created_at', { ascending: true })
      .limit(100)) as any

    if (fetchError) {
      throw new Error(`Failed to fetch messages: ${fetchError.message}`)
    }

    let autoResponded = 0
    let ownerNotified = 0
    const errors: string[] = []

    // Process each message
    for (const msg of messages || []) {
      try {
        const result = await processSupportMessage(
          {
            customer_email: msg.customer_email,
            customer_name: msg.customer_name,
            customer_phone: msg.customer_phone || undefined,
            message_body: msg.message_body,
            subject: msg.subject || undefined,
            source: (msg.source as any) || 'contact_form',
          },
          env,
        )

        if (result.auto_responded) autoResponded++
        if (result.owner_notified) ownerNotified++
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'unknown error'
        errors.push(`Message ${msg.id}: ${errorMsg}`)
      }
    }

    // Update run record with results
    await (supabase
      .from('support_classifier_runs' as any)
      .update({
        completed_at: new Date().toISOString(),
        messages_processed: messages?.length || 0,
        messages_auto_responded: autoResponded,
        messages_routed_to_owner: ownerNotified,
        errors: errors.length > 0 ? errors.join('\n') : null,
      })
      .eq('id', runId) as any)

    log.info('support.batch_process_complete', {
      messagesProcessed: messages?.length || 0,
      autoResponded,
      ownerNotified,
      errors: errors.length,
    })

    return {
      processed: messages?.length || 0,
      autoResponded,
      ownerNotified,
      errors,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'unknown error'
    try {
      await supabase
        .from('support_classifier_runs')
        .update({
          completed_at: new Date().toISOString(),
          errors: errorMsg,
        })
        .eq('id', runId)
    } catch {
      // Swallow error
    }

    log.error('support.batch_process_failed', { error: errorMsg })
    throw err
  }
}
