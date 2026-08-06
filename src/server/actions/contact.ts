'use server'

import { sendEmail } from '@/lib/email/resend'
import { withActionContext } from '@/lib/observability/action-context'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { z } from 'zod'

/**
 * Public contact form. Mails the shop inbox through the transactional Resend
 * client (reply-to = the customer). No outbox row: contact is not an order
 * event, and anon cannot insert into notification_outbox.
 */

const schema = z.object({
  name: z.string().trim().min(2, 'נא למלא שם').max(80, 'השם ארוך מדי'),
  email: z.string().trim().email('כתובת מייל לא תקינה').max(254),
  message: z.string().trim().min(10, 'ההודעה קצרה מדי').max(2000, 'ההודעה ארוכה מדי'),
  // Bots fill every field. Humans leave this alone (hidden with CSS).
  company: z.string().optional().default(''),
})

export type ContactState = { ok: boolean; message?: string; error?: string }

function contactTo(): string {
  return (process.env.CONTACT_TO ?? 'info@kenyonexpress.co.il').trim()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function runSubmitContactForm(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = schema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message'),
    company: formData.get('company') ?? '',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'בדקו את הפרטים ונסו שוב.' }
  }

  // Honeypot hit: pretend success so the bot does not retry with a different shape.
  if (parsed.data.company) {
    return { ok: true, message: 'תודה. ההודעה התקבלה ונחזור אליך בהקדם.' }
  }

  const ip = await getClientIp()
  if (!(await checkRateLimit(`contact:${ip}`, 5, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  const { name, email, message } = parsed.data
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safeMessage = escapeHtml(message).replaceAll('\n', '<br/>')

  const result = await sendEmail({
    to: contactTo(),
    replyTo: email,
    subject: `צור קשר: ${name}`,
    html: `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;text-align:right">
      <h1 style="font-size:18px;margin:0 0 12px">פנייה חדשה מהאתר</h1>
      <p style="margin:0 0 8px"><strong>שם:</strong> ${safeName}</p>
      <p style="margin:0 0 8px"><strong>מייל:</strong> ${safeEmail}</p>
      <p style="margin:16px 0 0">${safeMessage}</p>
    </div>`,
    text: `פנייה חדשה מהאתר\nשם: ${name}\nמייל: ${email}\n\n${message}`,
  })

  if (!result.ok && !result.skipped) {
    return { ok: false, error: 'השליחה נכשלה. נסו שוב, או פנו בוואטסאפ.' }
  }

  return { ok: true, message: 'תודה. ההודעה התקבלה ונחזור אליך בהקדם.' }
}

export async function submitContactForm(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  return withActionContext('contact.submit', () => runSubmitContactForm(_prev, formData))
}
