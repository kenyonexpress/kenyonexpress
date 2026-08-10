import { APP_PATHS, universalLink } from '@/lib/app/deep-links'

/**
 * Push copy, in Hebrew, for the three transactional kinds the app sends.
 *
 * A KIND WITHOUT A TEMPLATE HERE GETS NO PUSH, AND THAT IS THE GATE. The outbox
 * carries every notification the system owes, including supplier sale alerts
 * and admin notices, and none of those belong on a customer's lock screen. The
 * drain reads a `null` from here as "this row owes no push" and settles it
 * permanently, so adding a kind to the outbox can never accidentally start
 * pushing it.
 *
 * NO MARKETING. Each of the three is the direct consequence of an act by the
 * customer: a coupon they bought, a coupon they hold running out, money credited
 * to their wallet. Anything promotional is under the 30א consent regime and
 * needs a consent column this table does not have.
 *
 * LENGTH. iOS shows roughly 40 characters of title and two lines of body on the
 * lock screen; Android is similar. The copy is written to survive that cut, so
 * the actionable part is never in the tail.
 */

export type PushContent = {
  title: string
  body: string
  data: Record<string, unknown>
}

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function integer(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.round(parsed)
  }
  return null
}

/** Agorot to a shekel string. The money path is integers; only display divides. */
function shekels(agorotValue: number): string {
  const whole = Math.trunc(Math.abs(agorotValue) / 100)
  const fraction = Math.abs(agorotValue) % 100
  const sign = agorotValue < 0 ? '-' : ''
  return fraction === 0
    ? `${sign}₪${whole.toLocaleString('he-IL')}`
    : `${sign}₪${whole.toLocaleString('he-IL')}.${String(fraction).padStart(2, '0')}`
}

/**
 * Hebrew has a genuine dual and the plural is not a suffix, so "1 ימים" and
 * "2 ימים" both read wrong. Three forms, chosen the way a speaker would.
 */
export function daysInHebrew(days: number): string {
  if (days <= 0) return 'היום'
  if (days === 1) return 'מחר'
  if (days === 2) return 'בעוד יומיים'
  return `בעוד ${days} ימים`
}

function couponPurchased(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const vouchers = Array.isArray(payload.vouchers) ? payload.vouchers : []
  const first = (vouchers[0] ?? {}) as Record<string, unknown>
  const productName = text(first, 'product_name')
  const count = vouchers.length

  // A multi-coupon order names none of them rather than naming one and hiding
  // the rest, which reads as though the others failed.
  const body =
    count > 1
      ? `${count} קופונים מחכים לך באפליקציה. אפשר להציג אותם בבית העסק כבר עכשיו.`
      : productName
        ? `הקופון ל${productName} מוכן. אפשר להציג אותו בבית העסק כבר עכשיו.`
        : 'הקופון שלך מוכן ומחכה באפליקציה.'

  const voucherId = text(first, 'id')
  return {
    title: count > 1 ? 'הקופונים שלך מוכנים' : 'הקופון שלך מוכן',
    body,
    data: {
      kind: 'voucher_issued',
      path: count === 1 && voucherId ? APP_PATHS.coupon(voucherId) : APP_PATHS.coupons,
      url: universalLink(siteUrl, '/account/coupons'),
      order_id: text(payload, 'order_id'),
    },
  }
}

function couponExpiring(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const days = integer(payload, 'days_remaining')
  if (days === null) return null
  const productName = text(payload, 'product_name')
  const supplier = text(payload, 'supplier_name')
  const where = supplier ? ` ב${supplier}` : ''

  return {
    title: days <= 1 ? 'הקופון שלך פג מחר' : `הקופון שלך פג ${daysInHebrew(days)}`,
    body: productName
      ? `הקופון ל${productName}${where} עדיין לא מומש. שווה לנצל אותו.`
      : `יש לך קופון${where} שעדיין לא מומש.`,
    data: {
      kind: 'voucher_expiring',
      path: (() => {
        const voucherId = text(payload, 'voucher_id')
        return voucherId ? APP_PATHS.coupon(voucherId) : APP_PATHS.coupons
      })(),
      url: universalLink(siteUrl, '/account/coupons'),
      voucher_id: text(payload, 'voucher_id'),
    },
  }
}

function cashbackCredited(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const amount = integer(payload, 'amount_agorot')
  if (amount === null || amount <= 0) return null

  return {
    title: `נכנס לך קאשבק של ${shekels(amount)}`,
    body: 'הסכום נמצא בארנק שלך ואפשר להשתמש בו בקנייה הבאה.',
    data: {
      kind: 'cashback_credited',
      path: APP_PATHS.wallet,
      url: universalLink(siteUrl, '/account/wallet'),
      amount_agorot: amount,
      order_id: text(payload, 'order_id'),
    },
  }
}

/**
 * Returns `null` for every kind that owes no push. The caller must treat that
 * as a settled state, not as a failure to retry.
 */
export function buildPushContent(
  kind: string,
  payload: Record<string, unknown>,
  siteUrl: string,
): PushContent | null {
  switch (kind) {
    case 'voucher_issued':
      return couponPurchased(payload, siteUrl)
    case 'voucher_expiring':
      return couponExpiring(payload, siteUrl)
    case 'cashback_credited':
      return cashbackCredited(payload, siteUrl)
    default:
      return null
  }
}

/** The kinds that can ever produce a push. Exported so tests can assert the set. */
export const PUSHABLE_KINDS = ['voucher_issued', 'voucher_expiring', 'cashback_credited'] as const
