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

const BRAND = '#f5c518'
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
    <div dir="rtl" style="background:#f5f5f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
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
    default:
      return null
  }
}
