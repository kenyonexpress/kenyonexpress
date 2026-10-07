import { formatIls } from '@/lib/commerce/money'
import { agorot } from '@/lib/commerce/money'
import {
  RETURN_DESTINATION_LABELS,
  RETURN_REASONS,
  RETURN_WINDOW_DAYS,
  type ReturnDestination,
  type ReturnReasonCode,
} from '@/lib/returns/policy'

/**
 * The mails a return request produces. Pure: strings in, strings out.
 *
 * Not in `src/lib/email/notifications.ts` on purpose. That module renders the
 * outbox kinds (`notification_outbox.kind` is CHECKed to a fixed list in
 * production, measured 2026-10-08, and `return_requested` is not in it);
 * adding a kind is a migration. These go through `sendEmail` directly, with
 * an idempotency key per request, the same route the order feedback copy
 * takes. The completed-refund mail stays the outbox's `refund_completed`.
 */

export interface ReturnNotice {
  subject: string
  html: string
  text: string
  idempotencyKey: string
}

export interface ReturnReceivedInput {
  rma: string
  orderRef: string
  reasonCode: ReturnReasonCode
  destination: ReturnDestination
  note: string | null
  requestedAgorot: number
  feeAgorot: number
  refundAgorot: number
  /** A parcel has to come back; a coupon does not. */
  hasPhysical: boolean
  refundDueBy: string
  customerName: string | null
  customerEmail: string | null
  appUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dateHe(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'medium',
  }).format(at)
}

function paragraphs(lines: readonly string[]): { html: string; text: string } {
  return {
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n'),
    text: lines.join('\n\n'),
  }
}

function wrap(title: string, body: string): string {
  return `<div dir="rtl" lang="he" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6"><h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}</div>`
}

/** To the customer: the RMA, what happens next, and the deadline the law sets. */
export function buildReturnReceivedCustomerNotice(input: ReturnReceivedInput): ReturnNotice {
  const reason = RETURN_REASONS[input.reasonCode].label
  const lines: string[] = [
    `${input.customerName ? `שלום ${input.customerName},` : 'שלום,'}`,
    `קיבלנו את בקשת ההחזרה שלך להזמנה ${input.orderRef}. מספר הבקשה: ${input.rma}. שמרו אותו לכל פנייה.`,
    `סיבה: ${reason}. יעד ההחזר: ${RETURN_DESTINATION_LABELS[input.destination]}.`,
  ]
  if (input.note) lines.push(`ההערה שלך: ${input.note}`)
  if (input.hasPhysical) {
    lines.push(
      'אם ההזמנה כוללת מוצר פיזי, נחזור אליך עם הוראות להחזרת המוצר. אין צורך לשלוח דבר לפני שתקבלו אותן.',
    )
  }
  if (input.destination === 'original_method' && input.feeAgorot > 0) {
    lines.push(
      `על פי חוק הגנת הצרכן ייתכנו דמי ביטול של עד 5% או 100 ש"ח, הנמוך מביניהם. לבקשה זו: ${formatIls(
        agorot(input.feeAgorot),
      )}, כך שההחזר הצפוי הוא ${formatIls(agorot(input.refundAgorot))} מתוך ${formatIls(
        agorot(input.requestedAgorot),
      )}.`,
    )
  } else {
    lines.push(`ההחזר הצפוי: ${formatIls(agorot(input.refundAgorot))}, ללא דמי ביטול.`)
  }
  lines.push(
    `על פי חוק, הכסף יוחזר בתוך ${RETURN_WINDOW_DAYS} יום ממועד הבקשה, כלומר עד ${dateHe(
      input.refundDueBy,
    )}. אפשר לעקוב אחרי מצב הבקשה באזור האישי: ${input.appUrl}/account/return`,
  )
  const body = paragraphs(lines)
  const title = `בקשת ההחזרה ${input.rma} התקבלה`
  return {
    subject: title,
    html: wrap(title, body.html),
    text: `${title}\n\n${body.text}`,
    idempotencyKey: `return-received:${input.rma}`,
  }
}

/** To the shop inbox: the same facts, plus who asked, for the admin queue. */
export function buildReturnReceivedOwnerNotice(input: ReturnReceivedInput): ReturnNotice {
  const reason = RETURN_REASONS[input.reasonCode].label
  const lines: string[] = [
    `בקשת החזרה חדשה: ${input.rma} להזמנה ${input.orderRef}.`,
    `לקוח/ה: ${input.customerName ?? 'ללא שם'}${input.customerEmail ? ` (${input.customerEmail})` : ''}.`,
    `סיבה: ${reason}. יעד: ${RETURN_DESTINATION_LABELS[input.destination]}. סכום: ${formatIls(
      agorot(input.requestedAgorot),
    )}.`,
  ]
  if (input.note) lines.push(`הערת הלקוח: ${input.note}`)
  lines.push(
    `מועד אחרון להחזר לפי חוק: ${dateHe(input.refundDueBy)}. לטיפול: ${input.appUrl}/admin/orders/returns`,
  )
  const body = paragraphs(lines)
  const title = `בקשת החזרה ${input.rma} ממתינה להחלטה`
  return {
    subject: title,
    html: wrap(title, body.html),
    text: `${title}\n\n${body.text}`,
    idempotencyKey: `return-received-owner:${input.rma}`,
  }
}

export interface ReturnRejectedInput {
  rma: string
  orderRef: string
  reason: string | null
  customerName: string | null
  appUrl: string
}

/** To the customer: the request was refused, and why, in the admin's words. */
export function buildReturnRejectedNotice(input: ReturnRejectedInput): ReturnNotice {
  const lines: string[] = [
    `${input.customerName ? `שלום ${input.customerName},` : 'שלום,'}`,
    `בדקנו את בקשת ההחזרה ${input.rma} להזמנה ${input.orderRef} ולא יכולנו לאשר אותה.`,
  ]
  if (input.reason) lines.push(`הסיבה: ${input.reason}`)
  lines.push(
    `אם לדעתך נפלה טעות, אפשר להשיב למייל הזה או לפנות אלינו דרך ${input.appUrl}/contact ונבדוק שוב.`,
  )
  const body = paragraphs(lines)
  const title = `בקשת ההחזרה ${input.rma} לא אושרה`
  return {
    subject: title,
    html: wrap(title, body.html),
    text: `${title}\n\n${body.text}`,
    idempotencyKey: `return-rejected:${input.rma}`,
  }
}
