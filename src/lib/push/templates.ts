import { APP_PATHS, universalLink } from '@/lib/app/deep-links'

/**
 * Push copy, in Hebrew, for the five kinds the app sends.
 *
 * A KIND WITHOUT A TEMPLATE HERE GETS NO PUSH, AND THAT IS THE GATE. The outbox
 * carries every notification the system owes, including supplier sale alerts
 * and admin notices, and none of those belong on a customer's lock screen. The
 * drain reads a `null` from here as "this row owes no push" and settles it
 * permanently, so adding a kind to the outbox can never accidentally start
 * pushing it.
 *
 * NO MARKETING. Each one is the direct consequence of an act by the customer:
 * a coupon they bought, a coupon they hold running out, money credited to their
 * wallet, a parcel they are waiting for, and a price drop on a product THEY put
 * on their wishlist. `price_drop` is the only one that is not transactional and
 * it passes on that test alone -- it may never be widened into "products you
 * might like", which is the 30א consent regime and needs a column this table
 * does not have.
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
/**
 * Agorot, with the `.00` dropped when there is nothing after the point.
 *
 * Not `@/lib/money-format`'s `shekels`, which always prints two decimals: this
 * is a push notification title, where "₪25" reads and "₪25.00" is noise. The
 * name says agorot-in like the canonical one and says it is a different shape,
 * because the thing this repo cannot afford is two functions called `shekels`
 * that disagree about their unit.
 */
function shekelsCompact(agorotValue: number): string {
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
    title: `נכנס לך קאשבק של ${shekelsCompact(amount)}`,
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
 * The parcel is moving.
 *
 * THE TRACKING NUMBER IS NOT IN THE BODY, and that is deliberate. It is a long
 * LTR string in an RTL sentence, which is the exact shape this project has
 * already been bitten by: a bare number inside Hebrew text renders with its
 * digits in a plausible but wrong order, and a wrong tracking number is worse
 * than none because the customer will type it into a courier's site and be told
 * it does not exist. The carrier is named, the number is one tap away on the
 * order page where it is isolated properly.
 */
function orderShipped(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const orderRef = text(payload, 'order_ref')
  const carrier = text(payload, 'carrier')

  return {
    title: 'ההזמנה שלך יצאה לדרך',
    body: carrier
      ? `המשלוח נמסר ל${carrier}. פרטי המעקב מחכים בעמוד ההזמנה.`
      : 'המשלוח יצא. פרטי המעקב מחכים בעמוד ההזמנה.',
    data: {
      kind: 'order_shipped',
      path: (() => {
        const orderId = text(payload, 'order_id')
        return orderId ? APP_PATHS.order(orderId) : APP_PATHS.home
      })(),
      url: universalLink(siteUrl, '/account/orders'),
      order_id: text(payload, 'order_id'),
      order_ref: orderRef,
    },
  }
}

/**
 * A saved product got cheaper.
 *
 * THE ONLY NON-TRANSACTIONAL PUSH ON THE LIST, AND IT IS STILL NOT MARKETING.
 * The header above says each kind is the direct consequence of an act by the
 * customer. This one qualifies on that test and only on it: the customer put
 * this specific product on their wishlist and asked to hear about it. Nothing
 * here may ever be widened into "products you might like", which is the 30א
 * consent regime and needs a column this table does not have.
 *
 * IT REFUSES TO SEND WITHOUT BOTH PRICES. "המחיר ירד" with no number is an
 * advert; with both numbers it is the fact the customer asked for. It also
 * refuses a rise, because a wishlist alert that fires on a price INCREASE is
 * the worst possible use of a permission somebody granted.
 */
function priceDrop(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const was = integer(payload, 'saved_agorot')
  const now = integer(payload, 'now_agorot')
  const productName = text(payload, 'product_name')
  if (was === null || now === null || now >= was || now < 0) return null

  const slug = text(payload, 'product_slug')
  return {
    title: productName ? `${productName} בזול יותר` : 'מוצר שאהבת בזול יותר',
    body: `המחיר ירד מ-${shekelsCompact(was)} ל-${shekelsCompact(now)}.`,
    data: {
      kind: 'price_drop',
      path: APP_PATHS.home,
      url: universalLink(siteUrl, slug ? `/product/${slug}` : '/products'),
      product_id: text(payload, 'product_id'),
      now_agorot: now,
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
    case 'order_shipped':
      return orderShipped(payload, siteUrl)
    case 'price_drop':
      return priceDrop(payload, siteUrl)
    default:
      return null
  }
}

/** The kinds that can ever produce a push. Exported so tests can assert the set. */
export const PUSHABLE_KINDS = [
  'voucher_issued',
  'voucher_expiring',
  'cashback_credited',
  'order_shipped',
  'price_drop',
] as const
