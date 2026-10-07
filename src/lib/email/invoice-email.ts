import { LTR_ISOLATE_STYLE, ltrText } from '@/lib/email/bidi'
import { escapeHtml, renderEmailDocument } from '@/lib/email/layout'
import type { InvoiceDocumentType } from '@/lib/invoices/document'
import { invoicePdfFileName, invoiceTitle } from '@/lib/invoices/pdf'
import { formatAgorot } from '@/lib/vouchers/coupon-view'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * The email that carries a tax document to the customer.
 *
 * Pure, like every builder in this directory: a subject, two bodies and the
 * attachment's file name, no transport. Sending lives in
 * `server/payments/invoices.ts`, right after the document is marked issued,
 * and attaches the same bytes that were archived.
 *
 * WHY THE DOCUMENT IS ATTACHED AND ALSO LINKED. The attachment is the copy
 * the customer keeps: a mailbox outlives a session, and a tax document a
 * customer has to log in to see is one they cannot hand to an accountant
 * from their phone. The link is the copy that stays correct: it re-checks
 * ownership and serves the archived file, or renders a marked "העתק" when
 * no archive exists, so a forwarded mail does not become a door.
 *
 * Plain language, no marketing. This mail is a legal document's envelope.
 */

const { brand: BRAND, ink: INK, muted: MUTED, rule: RULE, panel: PANEL } = OFF_PAGE

export interface InvoiceEmailInput {
  customerName: string | null
  documentType: InvoiceDocumentType
  /** The printed number, e.g. `KE-INV-000042`. */
  documentNumber: string
  orderId: string
  totalAgorot: number
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export interface BuiltInvoiceEmail {
  subject: string
  html: string
  text: string
  attachmentFileName: string
}

const INTRO: Record<InvoiceDocumentType, string> = {
  tax_invoice_receipt: 'מצורפת חשבונית המס/קבלה עבור ההזמנה שלך.',
  coupon_receipt: 'מצורפת הקבלה על התשלום מראש עבור ההזמנה שלך.',
  credit_note: 'מצורפת חשבונית הזיכוי עבור ההחזר שבוצע בהזמנה שלך.',
}

const AMOUNT_LABEL: Record<InvoiceDocumentType, string> = {
  tax_invoice_receipt: 'סכום',
  coupon_receipt: 'סכום',
  credit_note: 'סכום הזיכוי',
}

export function buildInvoiceEmail(input: InvoiceEmailInput): BuiltInvoiceEmail {
  const title = invoiceTitle(input.documentType)
  const ref = input.orderId.slice(0, 8).toUpperCase()
  const site = input.siteUrl.replace(/\/+$/, '')
  const documentUrl = `${site}/account/orders/${input.orderId}/invoice`
  const amount = formatAgorot(input.totalAgorot)
  const greeting = input.customerName?.trim() ? `שלום ${input.customerName.trim()},` : 'שלום,'
  const subject = `${title} ${input.documentNumber} · הזמנה ${ref}`
  const attachmentFileName = invoicePdfFileName(input.documentNumber)

  const text = [
    greeting,
    '',
    INTRO[input.documentType],
    '',
    `מספר מסמך: ${ltrText(input.documentNumber)}`,
    `מספר הזמנה: ${ltrText(ref)}`,
    `${AMOUNT_LABEL[input.documentType]}: ${amount}`,
    '',
    `עותק של המסמך זמין גם בחשבון שלך: ${ltrText(documentUrl)}`,
    '',
    'מסמך ממוחשב. מומלץ לשמור את הקובץ המצורף.',
  ].join('\n')

  const row = (label: string, value: string, ltr = false): string =>
    `<tr>
      <td style="padding:6px 0;color:${MUTED};font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;color:${INK};font-size:14px;font-weight:700;text-align:left;${ltr ? LTR_ISOLATE_STYLE : ''}">${escapeHtml(value)}</td>
    </tr>`

  const bodyHtml = `
    <p style="margin:0 0 12px;color:${INK};font-size:16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6;">${escapeHtml(INTRO[input.documentType])}</p>
    <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${RULE};background:${PANEL};border-radius:6px;padding:10px 14px;margin:0 0 18px;">
      ${row('מספר מסמך', input.documentNumber, true)}
      ${row('מספר הזמנה', ref, true)}
      ${row(AMOUNT_LABEL[input.documentType], amount)}
    </table>
    <p style="margin:0 0 18px;">
      <a href="${escapeHtml(documentUrl)}" style="display:inline-block;background:${BRAND};color:${INK};text-decoration:none;font-weight:700;padding:11px 22px;border-radius:4px;font-size:15px;">לצפייה במסמך בחשבון שלי</a>
    </p>
    <p style="margin:0;color:${MUTED};font-size:13px;line-height:1.6;">מסמך ממוחשב. מומלץ לשמור את הקובץ המצורף (${escapeHtml(attachmentFileName)}).</p>
  `

  const html = renderEmailDocument({
    title: subject,
    preheader: `${title} ${input.documentNumber} מצורפת למייל זה.`,
    bodyHtml,
    footer: 'המייל נשלח אוטומטית עם הנפקת המסמך. לשאלות על ההזמנה אפשר להשיב למייל זה.',
  })

  return { subject, html, text, attachmentFileName }
}
