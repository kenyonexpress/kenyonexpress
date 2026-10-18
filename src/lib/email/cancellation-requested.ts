import { formatDateTime } from '@/lib/account/format'
import { formatAgorot } from '@/lib/vouchers/coupon-view'
import { OFF_PAGE } from '@/styles/tokens'

export interface CancellationEmailInput {
  refundId: string
  orderRef: string
  requestedAtIso: string
  requestedAgorot: number
  cancellationFeeAgorot: number
  destination: 'original_method' | 'wallet'
  autoApproved: boolean
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The customer's copy of their cancellation notice: six lines, sent the moment
 * the notice is recorded, because the statutory clock (section 14ה) starts at
 * the notice and the customer should hold the record of when that was.
 *
 * It states what was asked, the statutory fee rule, the three amounts, where
 * the money goes and the reference. It promises no date for the money beyond
 * the statute's own 14 days: when a card credit appears is the issuer's call.
 */
/** The six lines, shared by the email and the confirmation page. */
export function cancellationNoticeLines(input: CancellationEmailInput): string[] {
  const fee = Math.max(0, Math.round(input.cancellationFeeAgorot))
  const requested = Math.max(0, Math.round(input.requestedAgorot))
  const refund = Math.max(0, requested - fee)
  const when = formatDateTime(input.requestedAtIso)
  return [
    `קיבלנו את הודעת הביטול שלך להזמנה ${input.orderRef} בתאריך ${when}.`,
    'לפי חוק הגנת הצרכן, ביטול עסקה מרחוק בתוך 14 ימים מזכה בהחזר בניכוי דמי ביטול של 5% מהמחיר או 100 ש"ח, הנמוך מביניהם.',
    `סכום ההזמנה ${formatAgorot(requested)}, דמי ביטול ${formatAgorot(fee)}, סכום להחזר ${formatAgorot(refund)}.`,
    input.destination === 'wallet'
      ? 'הביטול נעשה בתקופה הנוספת שהמוצר מעניק מעבר לחוק, ולכן מלוא הסכום יזוכה לארנק שלך באתר.'
      : 'ההחזר יבוצע לאמצעי התשלום המקורי בתוך 14 ימים ממועד קבלת הודעת הביטול.',
    input.autoApproved
      ? 'הבקשה אושרה. שוברים שטרם מומשו מההזמנה בוטלו ולא ניתן עוד לממש אותם.'
      : 'הבקשה בבדיקה, ונחזור אליך בתוך 14 ימים.',
    `מספר הבקשה ${input.refundId}. לשאלות אפשר להשיב למייל הזה.`,
  ]
}

export function buildCancellationRequestedEmail(input: CancellationEmailInput): {
  subject: string
  html: string
  text: string
} {
  const subject = `קיבלנו את בקשת הביטול להזמנה ${input.orderRef}`
  const lines = cancellationNoticeLines(input)

  const text = ['שלום,', '', ...lines].join('\n')
  const { brand, ink, muted, rule, paper, panelWarm } = OFF_PAGE
  const html = `
    <div dir="rtl" style="background:${panelWarm};padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-size:20px;font-weight:800;color:${ink};margin-bottom:16px">KenyonExpress</div>
        <div style="background:${paper};border:1px solid ${rule};border-top:4px solid ${brand};border-radius:14px;padding:22px">
          <div style="font-size:18px;font-weight:700;color:${ink}">${escapeHtml(subject)}</div>
          ${lines.map((line) => `<p style="font-size:14px;color:${ink};margin:10px 0 0">${escapeHtml(line)}</p>`).join('')}
        </div>
        <div style="font-size:12px;color:${muted};margin-top:18px;text-align:center">קיבלת את המייל הזה כי נשלחה בקשת ביטול מהחשבון שלך ב-KenyonExpress.</div>
      </div>
    </div>`

  return { subject, html, text }
}
