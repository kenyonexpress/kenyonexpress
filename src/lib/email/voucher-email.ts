import { formatAgorot, formatCouponCode, formatCouponDate } from '@/lib/vouchers/coupon-view'

/**
 * The email a customer gets when their coupon is issued.
 *
 * Pure: it takes the vouchers and returns a subject and two bodies. Sending
 * lives in `server/payments/voucher-email.ts`, so what the customer reads can
 * be tested without a transport, a database or a network.
 *
 * TWO DECISIONS WORTH KNOWING
 *
 * 1. **No QR image is embedded.** The obvious move is a `data:` URI, and Gmail,
 *    Outlook and most corporate filters strip exactly those, which produces a
 *    broken-image icon where the coupon should be. The email carries the CODE,
 *    which a counter can always type, and a button to `/coupon/<id>`, which is
 *    where the QR is rendered and is the page the customer should be holding
 *    up anyway. An email that is useful with images disabled beats one that is
 *    beautiful when they are on.
 *
 * 2. **Both amounts are stated, in this order:** what was already paid on the
 *    site, then what is still owed at the business. The second is the number
 *    the customer will be asked for at a counter, and a coupon email that only
 *    says "you paid ₪22" sets up an argument at a till.
 *
 * The HTML is inline-styled and table-free where it can be. Email clients do
 * not honour stylesheets, and `dir="rtl"` has to be on the elements themselves
 * rather than on a wrapper for Outlook to respect it.
 */

export interface VoucherEmailLine {
  id: string
  code: string
  productName: string | null
  supplierName: string | null
  supplierAddress: string | null
  supplierPhone: string | null
  faceValueAgorot: number
  couponPriceAgorot: number
  remainingDueAgorot: number
  expiresAt: string
}

export interface VoucherEmailInput {
  customerName: string | null
  orderId: string
  vouchers: readonly VoucherEmailLine[]
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
  /**
   * The tax document's number, when one was issued before this email went out.
   *
   * Only the number travels. The link in the mail points at the account route,
   * which re-checks the session and then redirects, so a forwarded email does
   * not hand a stranger a tax document. An invoice still in the queue means no
   * block at all rather than a link that 404s.
   */
  invoiceNumber?: string | null
}

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

/**
 * The site's brand yellow, and it must stay the site's brand yellow.
 *
 * This was `#f5c518` in both email builders while every stylesheet in `src`
 * used `#fed700`. Nothing failed and nothing looked broken in isolation: a
 * transactional email simply arrived in a slightly different yellow from the
 * page it links to, which is the kind of thing only a customer comparing the
 * two ever notices, and it was hardcoded in exactly two places.
 *
 * `src/lib/email/brand-colour.test.ts` now reads the token out of
 * `src/app/globals.css` and fails if these drift apart again. It cannot be
 * imported from there at runtime: this module builds a string of inline styles
 * for mail clients that do not honour stylesheets, so the value has to be a
 * literal here.
 */
const BRAND = '#fed700'
const INK = '#1a1a1a'
const MUTED = '#6b7280'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function couponUrl(siteUrl: string, id: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/coupon/${encodeURIComponent(id)}`
}

export function buildVoucherEmail(input: VoucherEmailInput): BuiltEmail {
  const count = input.vouchers.length
  const subject =
    count === 1
      ? `הקופון שלך מוכן: ${input.vouchers[0]?.productName ?? 'קופון KenyonExpress'}`
      : `${count} קופונים מוכנים לך ב-KenyonExpress`

  const greeting = input.customerName ? `שלום ${input.customerName},` : 'שלום,'

  const textLines: string[] = [
    greeting,
    '',
    count === 1 ? 'הקופון שלך מוכן לשימוש.' : `${count} הקופונים שלך מוכנים לשימוש.`,
    '',
  ]

  const blocks = input.vouchers.map((voucher) => {
    const url = couponUrl(input.siteUrl, voucher.id)
    const code = formatCouponCode(voucher.code)
    const expiry = formatCouponDate(voucher.expiresAt)

    textLines.push(
      `— ${voucher.productName ?? 'קופון'}${voucher.supplierName ? ` · ${voucher.supplierName}` : ''}`,
      `קוד: ${code}`,
      `שולם באתר: ${formatAgorot(voucher.couponPriceAgorot)}`,
      `לתשלום בבית העסק: ${formatAgorot(voucher.remainingDueAgorot)}`,
      `בתוקף עד: ${expiry}`,
      `הצגת הקופון: ${url}`,
      '',
    )

    return `
      <div dir="rtl" style="border:1px solid #e5e7eb;border-radius:14px;padding:20px;margin:0 0 16px;background:#ffffff">
        <div style="font-size:17px;font-weight:700;color:${INK}">${escapeHtml(voucher.productName ?? 'קופון')}</div>
        ${
          voucher.supplierName
            ? `<div style="font-size:13px;color:${MUTED};margin-top:2px">${escapeHtml(voucher.supplierName)}</div>`
            : ''
        }
        <div dir="ltr" style="font-family:monospace;font-size:26px;font-weight:700;letter-spacing:3px;color:${INK};text-align:center;margin:16px 0;padding:12px;background:#f9fafb;border-radius:10px">${escapeHtml(code)}</div>
        <div style="font-size:14px;color:${INK};line-height:1.9">
          <div>שולם באתר: <strong>${escapeHtml(formatAgorot(voucher.couponPriceAgorot))}</strong></div>
          <div>לתשלום בבית העסק: <strong>${escapeHtml(formatAgorot(voucher.remainingDueAgorot))}</strong></div>
          <div style="color:${MUTED}">מחיר מלא: ${escapeHtml(formatAgorot(voucher.faceValueAgorot))}</div>
          <div style="color:${MUTED}">בתוקף עד ${escapeHtml(expiry)}</div>
        </div>
        ${
          voucher.supplierAddress || voucher.supplierPhone
            ? `<div style="font-size:13px;color:${MUTED};margin-top:10px">${[
                voucher.supplierAddress ? escapeHtml(voucher.supplierAddress) : '',
                voucher.supplierPhone ? escapeHtml(voucher.supplierPhone) : '',
              ]
                .filter(Boolean)
                .join(' · ')}</div>`
            : ''
        }
        <a href="${escapeHtml(url)}" style="display:block;margin-top:16px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">הצגת הקופון ו-QR</a>
      </div>`
  })

  const invoiceUrl = `${input.siteUrl.replace(/\/+$/, '')}/account/orders/${encodeURIComponent(input.orderId)}/invoice`

  textLines.push(
    'את ה-QR מציגים בעמוד הקופון עצמו. אם המסך לא נסרק, אפשר להקריא את הקוד לקופאי.',
    '',
  )
  if (input.invoiceNumber) {
    textLines.push(`חשבונית מס / קבלה ${input.invoiceNumber}: ${invoiceUrl}`, '')
  }
  textLines.push(`הזמנה ${input.orderId.slice(0, 8).toUpperCase()}`)

  const html = `
    <div dir="rtl" style="background:#f5f5f5;padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:4px">KenyonExpress</div>
        <div style="font-size:15px;color:${INK};margin-bottom:18px">${escapeHtml(greeting)} ${
          count === 1 ? 'הקופון שלך מוכן לשימוש.' : `${count} הקופונים שלך מוכנים לשימוש.`
        }</div>
        ${blocks.join('')}
        <div style="font-size:13px;color:${MUTED};line-height:1.8;margin-top:8px">
          את ה-QR מציגים בעמוד הקופון עצמו, כדי שהוא ייסרק גם כשהמייל חוסם תמונות.
          אם המסך לא נסרק, אפשר להקריא את הקוד לקופאי.
        </div>
        ${
          input.invoiceNumber
            ? `<div style="font-size:13px;color:${MUTED};margin-top:14px">חשבונית מס / קבלה ${escapeHtml(
                input.invoiceNumber,
              )} — <a href="${escapeHtml(invoiceUrl)}" style="color:${INK}">צפייה והורדה</a></div>`
            : ''
        }
        <div style="font-size:12px;color:${MUTED};margin-top:14px">הזמנה ${escapeHtml(
          input.orderId.slice(0, 8).toUpperCase(),
        )}</div>
      </div>
    </div>`

  return { subject, html, text: textLines.join('\n') }
}
