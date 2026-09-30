import { z } from 'zod'

/**
 * Private order-experience feedback: the pure half.
 *
 * A customer scores the whole order (delivery, packaging, the counter) from
 * 1 to 5 and may add a few lines. The row goes to `order_feedback` (pending
 * 247) and a copy goes to the shop inbox. NOTHING here is ever rendered to
 * another customer: there is no aggregate, no product-page surface, and the
 * account page shows a customer only their own row. The "never public"
 * promise is kept in three places: the table has no anon grant and no policy
 * naming anon, the only reads are owner-scoped or service-role, and this
 * module exposes no formatter for a public context.
 *
 * Eligibility is not decided here. The INSERT policy admits a row only for a
 * paid, undeleted order of the inserting user; this module only shapes the
 * input and the message.
 */

/** Form limit. The DB CHECK (247) holds a harder 2000. */
export const FEEDBACK_BODY_MAX = 1000

/** PostgREST: relation does not exist. The table ships in pending/247. */
export const FEEDBACK_TABLE_MISSING = 'PGRST205'

/** RLS refusal: the order is not the caller's paid order. */
export const FEEDBACK_NOT_ELIGIBLE = '42501'

/** UNIQUE(order_id): this order already has its feedback. */
export const FEEDBACK_ALREADY_SENT = '23505'

export const orderFeedbackSchema = z.object({
  orderId: z.string().uuid('הזמנה לא תקינה'),
  rating: z
    .number({ message: 'בחרו דירוג בין 1 ל-5' })
    .int('בחרו דירוג בין 1 ל-5')
    .min(1, 'בחרו דירוג בין 1 ל-5')
    .max(5, 'בחרו דירוג בין 1 ל-5'),
  body: z.string().trim().max(FEEDBACK_BODY_MAX, `עד ${FEEDBACK_BODY_MAX} תווים`).optional(),
})

export type OrderFeedbackInput = z.infer<typeof orderFeedbackSchema>

/**
 * Reads the form the way the action does. `rating` arrives as a string from a
 * radio group; an unchecked group arrives as null, which must fail the schema
 * with the rating message rather than with a NaN coercion.
 */
export function orderFeedbackFromForm(formData: FormData): unknown {
  const rawRating = formData.get('rating')
  const rawBody = formData.get('body')
  return {
    orderId: formData.get('orderId'),
    rating:
      typeof rawRating === 'string' && rawRating.trim() !== '' ? Number(rawRating) : undefined,
    body: typeof rawBody === 'string' ? rawBody : undefined,
  }
}

const RATING_LABELS: Record<number, string> = {
  1: 'גרוע',
  2: 'לא טוב',
  3: 'סביר',
  4: 'טוב',
  5: 'מצוין',
}

/** The Hebrew word for a score, for the form legend and the owner's mail. */
export function feedbackRatingLabel(rating: number): string {
  return RATING_LABELS[rating] ?? ''
}

/** "★★★★☆" for a score; a picture the mail client cannot mangle. */
export function feedbackStars(rating: number): string {
  const filled = Math.min(5, Math.max(0, Math.round(rating)))
  return '★'.repeat(filled) + '☆'.repeat(5 - filled)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export interface FeedbackNoticeInput {
  orderId: string
  rating: number
  body: string | null
  customerEmail: string | null
  customerName: string | null
  /** Absolute origin for the admin link, e.g. https://kenyonexpress.co.il */
  appUrl: string
}

export interface FeedbackNotice {
  subject: string
  html: string
  text: string
  /** Same order, same mail: Resend deduplicates a finalize that runs twice. */
  idempotencyKey: string
}

/**
 * The owner's copy. Everything the customer typed is escaped before it is
 * placed in HTML: the body is free text from a signed-in stranger and the
 * mail is opened in the owner's client, which renders HTML.
 */
export function buildFeedbackNotice(input: FeedbackNoticeInput): FeedbackNotice {
  const shortId = input.orderId.slice(0, 8)
  const stars = feedbackStars(input.rating)
  const label = feedbackRatingLabel(input.rating)
  const adminHref = `${input.appUrl.replace(/\/+$/, '')}/admin/orders/${input.orderId}`
  const who = input.customerName?.trim() || input.customerEmail || 'לקוח'
  const body = input.body?.trim() || ''

  const subject = `משוב על הזמנה ${shortId}: ${input.rating}/5 ${label}`.trim()

  const text = [
    'משוב פרטי על חוויית ההזמנה',
    `הזמנה: ${input.orderId}`,
    `לקוח: ${who}${input.customerEmail && who !== input.customerEmail ? ` (${input.customerEmail})` : ''}`,
    `דירוג: ${input.rating}/5 ${stars} ${label}`.trim(),
    body ? `\n${body}` : '\n(דירוג בלבד, ללא טקסט)',
    `\nלפרטי ההזמנה: ${adminHref}`,
    'המשוב נשמר ב-order_feedback ומוצג בעמוד ההזמנה בניהול. הוא לא מתפרסם באתר.',
  ].join('\n')

  const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;text-align:right">
    <h1 style="font-size:18px;margin:0 0 12px">משוב פרטי על חוויית ההזמנה</h1>
    <p style="margin:0 0 8px"><strong>הזמנה:</strong> <span dir="ltr">${escapeHtml(input.orderId)}</span></p>
    <p style="margin:0 0 8px"><strong>לקוח:</strong> ${escapeHtml(who)}${
      input.customerEmail && who !== input.customerEmail
        ? ` (<span dir="ltr">${escapeHtml(input.customerEmail)}</span>)`
        : ''
    }</p>
    <p style="margin:0 0 8px"><strong>דירוג:</strong> ${input.rating}/5 <span aria-hidden="true">${stars}</span> ${escapeHtml(label)}</p>
    ${
      body
        ? `<p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(body)}</p>`
        : '<p style="margin:16px 0 0">(דירוג בלבד, ללא טקסט)</p>'
    }
    <p style="margin:16px 0 0"><a href="${escapeHtml(adminHref)}">לפרטי ההזמנה בניהול</a></p>
    <p style="margin:16px 0 0;font-size:12px">המשוב פרטי. הוא מוצג בעמוד ההזמנה בניהול בלבד ולא מתפרסם באתר.</p>
  </div>`

  return { subject, html, text, idempotencyKey: `order-feedback:${input.orderId}` }
}
