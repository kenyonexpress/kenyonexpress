import { buildVoucherEmail } from '@/lib/email/voucher-email'
import { formatAgorot, formatCouponCode } from '@/lib/vouchers/coupon-view'

/**
 * Outbox notification builders for GOAL 6 (+ voucher_issued for migration 102).
 *
 * Same shape and the same reasoning as `voucher-email.ts`: a subject and two
 * bodies, no transport, no database, no network, so what a person reads can be
 * tested directly. The sending half is the drain at
 * `/api/cron/notifications`, which takes rows out of `notification_outbox`.
 *
 * Each builder takes the queued payload, which the enqueuing trigger froze at
 * the moment of the event. That is deliberate: a supplier alert must describe
 * the sale as it was, not as the product looks whenever the queue happens to
 * drain, and a rename between the two would otherwise rewrite history in an
 * email.
 *
 * Money arrives in agorot in every payload, and only `formatAgorot` turns it
 * into shekels. Nothing here divides by 100.
 */

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

export interface BuiltNotification {
  subject: string
  html: string
  text: string
}

export type NotificationKind =
  | 'order_paid'
  | 'supplier_sale'
  | 'voucher_redeemed'
  | 'voucher_issued'
  /** A coupon bought for somebody else. Added by migration 108. */
  | 'voucher_gifted'
  /** Fixed days-remaining reminder. Queued by 114's sweep. */
  | 'voucher_expiring'
  /** Wallet credit, enqueued after the ledger move. Added by 114. */
  | 'cashback_credited'
  /** Operator alert: a tax document gave up after five attempts. Added by 116. */
  | 'invoice_dead'
  /** Operator alert: a product is at or under its threshold. Added by 117. */
  | 'low_stock'
  /** Operator alert: our records and the terminal's disagree about money. */
  | 'reconciliation_gap'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function trimSite(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '')
}

function shell(bodyHtml: string, footer: string): string {
  return `
    <div dir="rtl" style="background:#f5f5f5;padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:16px">KenyonExpress</div>
        ${bodyHtml}
        <div style="font-size:12px;color:${MUTED};margin-top:18px;text-align:center">${escapeHtml(footer)}</div>
      </div>
    </div>`
}

function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** A date in Hebrew, or an empty string. Never the word `Invalid Date`. */
function hebrewDateTime(iso: unknown): string {
  const raw = asText(iso)
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Order confirmation, for the customer.
 *
 * Enqueued only for an order that issued no vouchers. A coupon order already
 * gets `voucher-email.ts`, which lists the codes and links each QR and is a
 * better confirmation than this one; sending both would be two emails for one
 * purchase. The trigger makes that call, not this builder.
 */
export function buildOrderPaidEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification {
  const ref =
    asText(payload.order_ref) ??
    String(payload.order_id ?? '')
      .slice(0, 8)
      .toUpperCase()
  const name = asText(payload.customer_name)
  const total = formatAgorot(asNumber(payload.total_agorot))
  const items = asNumber(payload.item_count)
  const url = `${trimSite(siteUrl)}/account/orders`

  /**
   * The receipt link points at OUR route, not at the provider's URL, and the
   * route re-checks ownership before it redirects. A tax document handed out as
   * a raw provider link is readable by anything that ever sees the mail - a
   * forward, a screenshot, a shared inbox.
   *
   * It is also why the link can be included at all despite the document not
   * existing yet when this mail is built: the invoice cron and the notification
   * cron are separate jobs, so the receipt is usually issued minutes after the
   * confirmation goes out. A link resolved at CLICK time has no race; an
   * embedded URL would have had to wait for one.
   */
  const orderId = asText(payload.order_id)
  const receiptUrl = orderId ? `${trimSite(siteUrl)}/account/orders/${orderId}/invoice` : null

  const subject = `ההזמנה שלך התקבלה · ${ref}`
  const greeting = name ? `שלום ${name},` : 'שלום,'

  const text = [
    greeting,
    '',
    'התשלום התקבל וההזמנה שלך נקלטה.',
    '',
    `מספר הזמנה: ${ref}`,
    `סך הכל שולם באתר: ${total}`,
    items > 0 ? `פריטים: ${items}` : '',
    '',
    `לפרטי ההזמנה: ${url}`,
    receiptUrl ? `לקבלה: ${receiptUrl}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:18px;font-weight:700;color:${INK}">התשלום התקבל</div>
        <div style="font-size:14px;color:${MUTED};margin-top:4px">${escapeHtml(greeting)}</div>
        <div style="font-size:14px;color:${INK};line-height:2;margin-top:14px">
          <div>מספר הזמנה: <strong dir="ltr">${escapeHtml(ref)}</strong></div>
          <div>סך הכל שולם באתר: <strong>${escapeHtml(total)}</strong></div>
          ${items > 0 ? `<div style="color:${MUTED}">${items} פריטים</div>` : ''}
        </div>
        <a href="${escapeHtml(url)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">לפרטי ההזמנה</a>
        ${receiptUrl ? `<div style="font-size:13px;color:${MUTED};margin-top:12px;text-align:center"><a href="${escapeHtml(receiptUrl)}" style="color:${MUTED}">להורדת הקבלה</a></div>` : ''}
      </div>`,
    'קיבלת את המייל הזה כי ביצעת רכישה ב-KenyonExpress.',
  )

  return { subject, html, text }
}

/**
 * Sale alert, for the business.
 *
 * One email per supplier per order, however many lines they sold. The amount is
 * the order value of their lines, and it is deliberately NOT called a payout:
 * the split, the commission and the balance the customer still owes at the
 * counter are all different numbers, and naming this one wrong in a message to
 * a business is how a dispute starts. It says what was sold and for how much.
 */
export function buildSupplierSaleEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification {
  const ref =
    asText(payload.order_ref) ??
    String(payload.order_id ?? '')
      .slice(0, 8)
      .toUpperCase()
  const supplier = asText(payload.supplier_name) ?? 'בית העסק'
  const amount = formatAgorot(asNumber(payload.amount_agorot))
  const url = `${trimSite(siteUrl)}/supplier/orders`

  const lines = Array.isArray(payload.lines) ? (payload.lines as Record<string, unknown>[]) : []
  const rendered = lines.map((line) => ({
    name: asText(line.product_name) ?? 'פריט',
    quantity: Math.max(1, asNumber(line.quantity)),
    isCoupon: line.product_type === 'coupon',
  }))

  const subject = `מכירה חדשה ב-KenyonExpress · הזמנה ${ref}`

  const text = [
    `שלום ${supplier},`,
    '',
    'התקבלה אצלכם מכירה חדשה.',
    '',
    ...rendered.map((l) => `— ${l.name} × ${l.quantity}${l.isCoupon ? ' (קופון)' : ''}`),
    '',
    `סכום ההזמנה אצלכם: ${amount}`,
    `מספר הזמנה: ${ref}`,
    '',
    rendered.some((l) => l.isCoupon)
      ? 'קופון נפדה בבית העסק בסריקת ה-QR, והיתרה נגבית מהלקוח במקום.'
      : '',
    `לניהול ההזמנות: ${url}`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:18px;font-weight:700;color:${INK}">מכירה חדשה</div>
        <div style="font-size:14px;color:${MUTED};margin-top:4px">${escapeHtml(supplier)}</div>
        <div style="font-size:14px;color:${INK};line-height:2;margin-top:14px">
          ${rendered
            .map(
              (l) =>
                `<div>${escapeHtml(l.name)} <span style="color:${MUTED}">× ${l.quantity}${l.isCoupon ? ' · קופון' : ''}</span></div>`,
            )
            .join('')}
        </div>
        <div style="font-size:14px;color:${INK};line-height:2;margin-top:14px;border-top:1px solid #e5e7eb;padding-top:12px">
          <div>סכום ההזמנה אצלכם: <strong>${escapeHtml(amount)}</strong></div>
          <div style="color:${MUTED}">מספר הזמנה <span dir="ltr">${escapeHtml(ref)}</span></div>
        </div>
        ${
          rendered.some((l) => l.isCoupon)
            ? `<div style="font-size:13px;color:${MUTED};margin-top:12px">קופון נפדה בבית העסק בסריקת ה-QR, והיתרה נגבית מהלקוח במקום.</div>`
            : ''
        }
        <a href="${escapeHtml(url)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">לניהול ההזמנות</a>
      </div>`,
    'קיבלתם את המייל הזה כספקים ב-KenyonExpress.',
  )

  return { subject, html, text }
}

/**
 * Coupon scanned, for the customer.
 *
 * This is the one notification whose job is partly security: it is how a
 * customer finds out that a coupon they still hold was redeemed by somebody
 * else. So it states where and when in plain terms rather than only
 * congratulating, and it names the amount collected at the counter, which is
 * the number they can check against what they were actually charged.
 */
export function buildVoucherRedeemedEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification {
  const code = formatCouponCode(asText(payload.code) ?? '')
  const product = asText(payload.product_name) ?? 'הקופון שלך'
  const supplier = asText(payload.supplier_name)
  const when = hebrewDateTime(payload.redeemed_at)
  const collected = asNumber(payload.collected_agorot)
  const url = `${trimSite(siteUrl)}/account/coupons`

  const subject = `הקופון מומש · ${product}`

  const text = [
    'שלום,',
    '',
    `הקופון "${product}" מומש${supplier ? ` בבית העסק ${supplier}` : ''}${when ? ` ב-${when}` : ''}.`,
    '',
    code ? `קוד הקופון: ${code}` : '',
    collected > 0 ? `נגבה בבית העסק: ${formatAgorot(collected)}` : '',
    '',
    'אם לא אתם מימשתם את הקופון, פנו אלינו מיד.',
    '',
    `לכל הקופונים שלך: ${url}`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:18px;font-weight:700;color:${INK}">הקופון מומש</div>
        <div style="font-size:14px;color:${INK};margin-top:8px">${escapeHtml(product)}</div>
        ${supplier ? `<div style="font-size:13px;color:${MUTED};margin-top:2px">${escapeHtml(supplier)}</div>` : ''}
        ${code ? `<div dir="ltr" style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:3px;color:${INK};text-align:center;margin:16px 0;padding:12px;background:#f9fafb;border-radius:10px">${escapeHtml(code)}</div>` : ''}
        <div style="font-size:14px;color:${INK};line-height:2">
          ${when ? `<div style="color:${MUTED}">מומש ב-${escapeHtml(when)}</div>` : ''}
          ${collected > 0 ? `<div>נגבה בבית העסק: <strong>${escapeHtml(formatAgorot(collected))}</strong></div>` : ''}
        </div>
        <div style="font-size:13px;color:${MUTED};margin-top:12px">אם לא אתם מימשתם את הקופון, פנו אלינו מיד.</div>
        <a href="${escapeHtml(url)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">לכל הקופונים שלי</a>
      </div>`,
    'קיבלת את המייל הזה כי הקופון רשום על שמך ב-KenyonExpress.',
  )

  return { subject, html, text }
}

/**
 * Coupon delivery after pay. Payload shape is frozen by
 * `tg_orders_notify_paid` in migration 102 (snake_case voucher rows).
 * Reuses `buildVoucherEmail` so the transitional finalize sender and the
 * outbox drain cannot drift apart on copy or amounts.
 */
export function buildVoucherIssuedEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification {
  const orderId = asText(payload.order_id) ?? 'unknown'
  const raw = Array.isArray(payload.vouchers) ? payload.vouchers : []
  const vouchers = raw.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const v = row as Record<string, unknown>
    const id = asText(v.id)
    const code = asText(v.code)
    const expiresAt = asText(v.expires_at)
    if (!id || !code || !expiresAt) return []
    return [
      {
        id,
        code,
        productName: asText(v.product_name),
        supplierName: asText(v.supplier_name),
        supplierAddress: asText(v.supplier_address),
        supplierPhone: asText(v.supplier_phone),
        faceValueAgorot: asNumber(v.face_value_agorot),
        couponPriceAgorot: asNumber(v.coupon_price_agorot),
        remainingDueAgorot: asNumber(v.remaining_amount_due_agorot),
        expiresAt,
      },
    ]
  })

  return buildVoucherEmail({
    customerName: asText(payload.customer_name),
    orderId,
    vouchers,
    siteUrl: trimSite(siteUrl),
  })
}

/**
 * A coupon somebody bought for somebody else (108).
 *
 * The one email on this system sent to an address that never registered, so it
 * says who it is from before it says anything else - an unexplained coupon from
 * a store you have not heard of is indistinguishable from a phishing mail.
 *
 * It carries the CLAIM link, not the coupon code, and that is the whole design:
 * the voucher belongs to the buyer until the recipient claims it, because the
 * buyer paid and a refund belongs to them. A code in this email would be
 * redeemable by whoever forwards it, with no record of who now owns it.
 *
 * The greeting is the buyer's own words, so it is escaped like every other
 * value here and never interpolated raw.
 */
export function buildVoucherGiftedEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification {
  const product = asText(payload.product_name) ?? 'קופון'
  const sender = asText(payload.sender_name)
  const recipient = asText(payload.recipient_name)
  const message = asText(payload.gift_message)
  const token = asText(payload.claim_token) ?? ''
  const expires = hebrewDateTime(payload.expires_at)
  const url = `${trimSite(siteUrl)}/gift/${encodeURIComponent(token)}`

  const subject = sender ? `${sender} שלח לך מתנה: ${product}` : `קיבלת מתנה: ${product}`
  const greeting = recipient ? `שלום ${recipient},` : 'שלום,'

  const text = [
    greeting,
    '',
    sender ? `${sender} קנה עבורך קופון ב-KenyonExpress:` : 'קנו עבורך קופון ב-KenyonExpress:',
    product,
    '',
    message ? `"${message}"` : '',
    '',
    'כדי לקבל את הקופון לחשבון שלך:',
    url,
    '',
    expires ? `הקופון בתוקף עד ${expires}.` : '',
    'הקישור אישי. אל תעבירו אותו הלאה.',
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:18px;font-weight:700;color:${INK}">${escapeHtml(
          sender ? `${sender} שלח לך מתנה` : 'קיבלת מתנה',
        )}</div>
        <div style="font-size:15px;color:${INK};margin-top:10px">${escapeHtml(greeting)}</div>
        <div style="font-size:16px;font-weight:700;color:${INK};margin-top:12px">${escapeHtml(product)}</div>
        ${
          message
            ? `<div style="font-size:14px;color:${INK};line-height:1.9;margin-top:14px;padding:14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">${escapeHtml(message)}</div>`
            : ''
        }
        <a href="${escapeHtml(url)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">קבלת הקופון</a>
        ${expires ? `<div style="font-size:13px;color:${MUTED};margin-top:12px">הקופון בתוקף עד ${escapeHtml(expires)}.</div>` : ''}
        <div style="font-size:13px;color:${MUTED};margin-top:6px">הקישור אישי. אל תעבירו אותו הלאה.</div>
      </div>`,
    'קיבלת את המייל הזה כי מישהו קנה עבורך קופון ב-KenyonExpress.',
  )

  return { subject, html, text }
}

/**
 * The expiry reminder. Queued by `enqueue_expiring_voucher_notices` at fixed
 * days-remaining buckets, so a customer sees it at 7 days and again at 1.
 *
 * It carries a real deadline or it is not sent. A reminder without a date is a
 * nag; the caller keeps the day count in the payload precisely so this can
 * refuse to render without one, and the drain then parks the row rather than
 * mailing a blank. Same rule the push template applies.
 */
export function buildVoucherExpiringEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification | null {
  const days = Math.round(asNumber(payload.days_remaining))
  const expires = hebrewDateTime(payload.expires_at)
  if (days <= 0 && !expires) return null

  const product = asText(payload.product_name) ?? 'הקופון שלך'
  const supplier = asText(payload.supplier_name)
  const url = `${trimSite(siteUrl)}/account/coupons`
  const when = days === 1 ? 'מחר' : days === 2 ? 'בעוד יומיים' : `בעוד ${days} ימים`

  const subject = days === 1 ? `${product} פג מחר` : `${product} פג ${when}`

  const text = [
    'שלום,',
    '',
    `${product}${supplier ? ` ב${supplier}` : ''} עדיין לא מומש, והתוקף שלו נגמר ${when}.`,
    expires ? `תאריך התפוגה: ${expires}.` : '',
    '',
    'הקופונים שלך:',
    url,
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:18px;font-weight:700;color:${INK}">${escapeHtml(`הקופון פג ${when}`)}</div>
        <div style="font-size:16px;font-weight:700;color:${INK};margin-top:12px">${escapeHtml(product)}</div>
        ${supplier ? `<div style="font-size:14px;color:${MUTED};margin-top:4px">${escapeHtml(supplier)}</div>` : ''}
        ${expires ? `<div style="font-size:13px;color:${MUTED};margin-top:12px">בתוקף עד ${escapeHtml(expires)}.</div>` : ''}
        <a href="${escapeHtml(url)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">לצפייה בקופון</a>
      </div>`,
    'קיבלת את המייל הזה כי יש לך קופון פעיל ב-KenyonExpress.',
  )

  return { subject, html, text }
}

/**
 * Cashback landing in the wallet. Enqueued by `finalizeOrder` after the credit
 * has actually moved through `fn_wallet_transfer`, never before: an email that
 * promises money the ledger does not hold is a support ticket.
 */
export function buildCashbackCreditedEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification | null {
  const amountAgorot = Math.round(asNumber(payload.amount_agorot))
  if (amountAgorot <= 0) return null

  const whole = Math.trunc(amountAgorot / 100)
  const fraction = amountAgorot % 100
  const amount =
    fraction === 0
      ? `₪${whole.toLocaleString('he-IL')}`
      : `₪${whole.toLocaleString('he-IL')}.${String(fraction).padStart(2, '0')}`

  const ref = asText(payload.order_ref)
  const url = `${trimSite(siteUrl)}/account/wallet`
  const subject = `נכנס לך קאשבק של ${amount}`

  const text = [
    'שלום,',
    '',
    `זיכינו את הארנק שלך ב-${amount}${ref ? ` על הזמנה ${ref}` : ''}.`,
    'אפשר להשתמש בסכום בקנייה הבאה.',
    '',
    'הארנק שלך:',
    url,
  ].join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:18px;font-weight:700;color:${INK}">${escapeHtml(subject)}</div>
        <div style="font-size:15px;color:${INK};margin-top:10px">זיכינו את הארנק שלך${ref ? ` על הזמנה ${escapeHtml(ref)}` : ''}. אפשר להשתמש בסכום בקנייה הבאה.</div>
        <a href="${escapeHtml(url)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">לארנק שלי</a>
      </div>`,
    'קיבלת את המייל הזה כי נכנס קאשבק לארנק שלך ב-KenyonExpress.',
  )

  return { subject, html, text }
}

/**
 * Operator alert for a tax document that has stopped retrying.
 *
 * Deliberately plain and deliberately actionable: the order id, the reason the
 * provider gave, and the admin URL. No branding, because it is not going to a
 * customer, and adding a hero image to an alert is how it gets skimmed.
 *
 * The provider's raw error is included here and NOT shown to customers
 * anywhere. That asymmetry is the point of an operator channel.
 */
export function buildInvoiceDeadEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification | null {
  const orderId = asText(payload.order_id)
  if (!orderId) return null

  const ref = asText(payload.order_ref) ?? orderId.slice(0, 8).toUpperCase()
  const documentType = asText(payload.document_type) ?? 'מסמך'
  const reason = asText(payload.reason) ?? 'לא ידוע'
  const attempts = asNumber(payload.attempts)
  const url = `${trimSite(siteUrl)}/admin/orders/${orderId}`

  const subject = `נכשלה הנפקת מסמך להזמנה ${ref}`

  const text = [
    `הנפקת ${documentType} להזמנה ${ref} נכשלה ${attempts} פעמים והפסיקה לנסות.`,
    '',
    `סיבה אחרונה: ${reason}`,
    '',
    'ההזמנה באדמין:',
    url,
    '',
    'המסמך לא הונפק. הלקוח שילם ואין לו קבלה.',
  ].join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:17px;font-weight:700;color:${INK}">${escapeHtml(subject)}</div>
        <div style="font-size:14px;color:${INK};margin-top:10px">${escapeHtml(`הנפקת ${documentType} נכשלה ${attempts} פעמים והפסיקה לנסות.`)}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:10px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">${escapeHtml(reason)}</div>
        <div style="font-size:14px;color:${INK};margin-top:12px">הלקוח שילם ואין לו קבלה.</div>
        <a href="${escapeHtml(url)}" style="display:block;margin-top:16px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:12px 18px;border-radius:10px">פתיחת ההזמנה באדמין</a>
      </div>`,
    'התראה תפעולית, לא הודעה ללקוח.',
  )

  return { subject, html, text }
}

/**
 * Operator alert for a product running out.
 *
 * States AVAILABLE and the raw level as two separate numbers when they differ,
 * because the gap between them is live checkouts - and an operator who sees
 * only "3 in stock" while all three are inside payment sessions will conclude
 * the alert is wrong.
 */
export function buildLowStockEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification | null {
  const productId = asText(payload.product_id)
  if (!productId) return null

  const name = asText(payload.product_name) ?? 'מוצר'
  const available = Math.round(asNumber(payload.available))
  const level = Math.round(asNumber(payload.stock_quantity))
  const threshold = Math.round(asNumber(payload.threshold))
  const supplier = asText(payload.supplier_name)
  const url = `${trimSite(siteUrl)}/admin/products/${productId}`
  const held = level - available

  const subject = available <= 0 ? `אזל המלאי: ${name}` : `מלאי נמוך: ${name}`

  const text = [
    available <= 0 ? `${name} אזל מהמלאי.` : `${name} ירד ל-${available} יחידות זמינות.`,
    supplier ? `ספק: ${supplier}` : '',
    `סף התראה: ${threshold}`,
    held > 0 ? `${held} יחידות מוחזקות כרגע בתשלומים פעילים.` : '',
    '',
    'לעריכת המוצר:',
    url,
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:17px;font-weight:700;color:${INK}">${escapeHtml(subject)}</div>
        <div style="font-size:14px;color:${INK};line-height:2;margin-top:12px">
          <div>זמין למכירה: <strong>${available}</strong></div>
          ${held > 0 ? `<div style="color:${MUTED}">${held} מוחזקות בתשלומים פעילים (מתוך ${level} במלאי)</div>` : ''}
          <div style="color:${MUTED}">סף התראה: ${threshold}</div>
          ${supplier ? `<div style="color:${MUTED}">ספק: ${escapeHtml(supplier)}</div>` : ''}
        </div>
        <a href="${escapeHtml(url)}" style="display:block;margin-top:16px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:12px 18px;border-radius:10px">עריכת המוצר</a>
      </div>`,
    'התראה תפעולית, לא הודעה ללקוח.',
  )

  return { subject, html, text }
}

/**
 * Operator alert: the terminal and our database disagree about money.
 *
 * The most urgent mail this system sends, and the copy says why in the first
 * line: `missing_locally` means a customer was charged and has no order, which
 * no support ticket will ever report because there is no order number to cite.
 */
export function buildReconciliationGapEmail(
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification | null {
  const critical = Math.round(asNumber(payload.critical))
  if (critical <= 0) return null

  const day = asText(payload.day) ?? ''
  const rows = Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : []
  const url = `${trimSite(siteUrl)}/admin/payments`

  const subject = `⚠️ ${critical} פערי סליקה מול המסוף (${day})`

  const describe = (row: Record<string, unknown>): string => {
    const kind = asText(row.kind)
    const tx = asText(row.transactionId) ?? '—'
    if (kind === 'missing_locally') {
      return `${tx}: המסוף חייב ${formatAgorot(asNumber(row.terminalAgorot))} ואין אצלנו רישום כלל`
    }
    return `${tx}: המסוף ${formatAgorot(asNumber(row.terminalAgorot))} מול ${formatAgorot(asNumber(row.localAgorot))} אצלנו`
  }

  const text = [
    `נמצאו ${critical} פערים בין הרישום שלנו לדוח המסוף.`,
    '',
    'פער מסוג "אין אצלנו רישום" פירושו לקוח שחויב ואין לו הזמנה. הוא לא ייפתח פנייה,',
    'כי אין לו מספר הזמנה לצטט.',
    '',
    ...rows.map((row) => `— ${describe(row)}`),
    '',
    url,
  ].join('\n')

  const html = shell(
    `<div dir="rtl" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
        <div style="font-size:17px;font-weight:700;color:${INK}">${escapeHtml(subject)}</div>
        <div style="font-size:14px;color:${INK};margin-top:10px">פער מסוג "אין אצלנו רישום" פירושו לקוח שחויב ואין לו הזמנה, והוא לא ייפתח פנייה כי אין לו מספר הזמנה לצטט.</div>
        <div style="font-size:13px;color:${MUTED};margin-top:12px;line-height:2">
          ${rows.map((row) => `<div>${escapeHtml(describe(row))}</div>`).join('')}
        </div>
        <a href="${escapeHtml(url)}" style="display:block;margin-top:16px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:12px 18px;border-radius:10px">פתיחת התשלומים באדמין</a>
      </div>`,
    'התראה תפעולית, לא הודעה ללקוח.',
  )

  return { subject, html, text }
}

/** Dispatch by queued kind. Unknown kinds return null so the drain can park them. */
export function buildNotification(
  kind: string,
  payload: Record<string, unknown>,
  siteUrl: string,
): BuiltNotification | null {
  switch (kind) {
    case 'order_paid':
      return buildOrderPaidEmail(payload, siteUrl)
    case 'supplier_sale':
      return buildSupplierSaleEmail(payload, siteUrl)
    case 'voucher_redeemed':
      return buildVoucherRedeemedEmail(payload, siteUrl)
    case 'voucher_issued':
      return buildVoucherIssuedEmail(payload, siteUrl)
    case 'voucher_gifted':
      return buildVoucherGiftedEmail(payload, siteUrl)
    case 'voucher_expiring':
      return buildVoucherExpiringEmail(payload, siteUrl)
    case 'cashback_credited':
      return buildCashbackCreditedEmail(payload, siteUrl)
    case 'invoice_dead':
      return buildInvoiceDeadEmail(payload, siteUrl)
    case 'low_stock':
      return buildLowStockEmail(payload, siteUrl)
    case 'reconciliation_gap':
      return buildReconciliationGapEmail(payload, siteUrl)
    default:
      return null
  }
}
