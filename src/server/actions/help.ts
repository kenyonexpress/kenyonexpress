'use server'

import { HELP_TOPICS, helpTopicLabel, isHelpTopicId } from '@/content/help/topics'
import { supportEmail } from '@/lib/contact-address'
import { escapeHtml } from '@/lib/email/layout'
import { sendEmail } from '@/lib/email/resend'
import { normalizeOrderRef } from '@/lib/help/order-links'
import { withActionContext } from '@/lib/observability/action-context'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { z } from 'zod'

/**
 * The help-centre form (`/help`, STEP 50).
 *
 * Same shape as the contact form, plus the two fields that make a request
 * answerable without a reply asking for them: the topic shelf and an order
 * reference. Mails `supportEmail()` (SUPPORT_TO, the owner's inbox) through
 * the transactional Resend client with reply-to set to the customer. No outbox
 * row: a help request is not an order event, and anon cannot insert into
 * notification_outbox.
 */

const topicIds = HELP_TOPICS.map((t) => t.id) as [string, ...string[]]

const schema = z.object({
  name: z.string().trim().min(2, 'נא למלא שם').max(80, 'השם ארוך מדי'),
  email: z.string().trim().email('כתובת מייל לא תקינה').max(254),
  topic: z.enum(topicIds, { message: 'נא לבחור נושא' }),
  orderRef: z.string().trim().max(64, 'מספר ההזמנה ארוך מדי').optional().default(''),
  message: z.string().trim().min(10, 'ההודעה קצרה מדי').max(2000, 'ההודעה ארוכה מדי'),
  // Bots fill every field. Humans leave this alone (hidden with CSS).
  company: z.string().optional().default(''),
})

export type HelpState = { ok: boolean; message?: string; error?: string }

const RECEIVED = 'תודה. הפנייה התקבלה ונחזור אליך בהקדם.'

async function runSubmitHelpRequest(_prev: HelpState, formData: FormData): Promise<HelpState> {
  const parsed = schema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    topic: formData.get('topic'),
    orderRef: formData.get('orderRef') ?? '',
    message: formData.get('message'),
    company: formData.get('company') ?? '',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'בדקו את הפרטים ונסו שוב.' }
  }

  // Honeypot hit: pretend success so the bot does not retry with a different shape.
  if (parsed.data.company) return { ok: true, message: RECEIVED }

  // A reference that is not an id is dropped, not mailed: the field is free
  // text from the browser and the mail is read in an inbox.
  if (parsed.data.orderRef && !normalizeOrderRef(parsed.data.orderRef)) {
    return { ok: false, error: 'מספר ההזמנה לא תקין. אפשר להשאיר את השדה ריק.' }
  }

  const ip = await getClientIp()
  if (!(await checkRateLimit(`help:${ip}`, 5, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  const { name, email, message } = parsed.data
  const topic = parsed.data.topic
  const topicLabel = isHelpTopicId(topic) ? helpTopicLabel(topic) : topic
  const orderRef = normalizeOrderRef(parsed.data.orderRef)

  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safeTopic = escapeHtml(topicLabel)
  const safeMessage = escapeHtml(message).replaceAll('\n', '<br/>')
  const orderLineHtml = orderRef
    ? `<p style="margin:0 0 8px"><strong>הזמנה:</strong> <span dir="ltr">${escapeHtml(orderRef)}</span></p>`
    : ''
  const orderLineText = orderRef ? `הזמנה: ${orderRef}\n` : ''
  const subjectRef = orderRef ? ` (הזמנה ${orderRef.slice(0, 8).toUpperCase()})` : ''

  const result = await sendEmail({
    to: supportEmail(),
    replyTo: email,
    subject: `מרכז עזרה, ${topicLabel}: ${name}${subjectRef}`,
    html: `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;text-align:right">
      <h1 style="font-size:18px;margin:0 0 12px">פנייה חדשה ממרכז העזרה</h1>
      <p style="margin:0 0 8px"><strong>נושא:</strong> ${safeTopic}</p>
      <p style="margin:0 0 8px"><strong>שם:</strong> ${safeName}</p>
      <p style="margin:0 0 8px"><strong>מייל:</strong> <span dir="ltr">${safeEmail}</span></p>
      ${orderLineHtml}
      <p style="margin:16px 0 0">${safeMessage}</p>
    </div>`,
    text: `פנייה חדשה ממרכז העזרה\nנושא: ${topicLabel}\nשם: ${name}\nמייל: ${email}\n${orderLineText}\n${message}`,
  })

  if (!result.ok && !result.skipped) {
    return { ok: false, error: 'השליחה נכשלה. נסו שוב, או פנו בוואטסאפ.' }
  }

  return { ok: true, message: RECEIVED }
}

export async function submitHelpRequest(_prev: HelpState, formData: FormData): Promise<HelpState> {
  return withActionContext('help.submit', () => runSubmitHelpRequest(_prev, formData))
}
