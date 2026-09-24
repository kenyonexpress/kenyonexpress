import { APP_PATHS, universalLink } from '@/lib/app/deep-links'

/**
 * Push copy, in Hebrew, for every customer kind the outbox carries.
 *
 * A KIND WITHOUT A TEMPLATE HERE GETS NO PUSH, AND THAT IS THE GATE. The outbox
 * carries every notification the system owes, including supplier sale alerts
 * and admin notices, and none of those belong on a customer's lock screen. The
 * drain reads a `null` from here as "this row owes no push" and settles it
 * permanently, so adding a kind to the outbox can never accidentally start
 * pushing it.
 *
 * WHY THE LIST GREW ON 25.09.2026 (Q09). The owner's list of customer mails
 * is five items long -- purchase confirmation, password reset, expiry
 * reminder, security alert, gift coupon -- and "everything else is web push
 * linking to the order page". So the receipt, the redemption notice, the
 * refund, the two wallet credits and the wishlist restock, which used to be
 * mails and then were nothing, are pushes now. `welcome` is still nothing:
 * it announces no event and has no order to link; the bell carries it.
 * `voucher_gifted` is still nothing: the recipient has no account and no
 * browser subscription, which is why that one stays a mail.
 *
 * `data.url` IS A SAME-ORIGIN PATH, NOT AN ABSOLUTE URL, and this is a fix.
 * `public/sw.js` opens `payload.url` only when it starts with `/`; anything
 * else falls back to `/`. Every template here used to put an `https://` link
 * in `url`, so every web push click landed on the home page. The absolute
 * form is still available as `data.link` for a consumer that wants it; the
 * React Native app reads `data.path` and neither.
 *
 * THE ORDER PAGE IS THE DESTINATION whenever the payload names an order, and
 * `/account/orders` when it does not. The coupon codes, the QR, the receipt
 * and the cancellation form all live there, which is why the purchase mail
 * carries none of them.
 *
 * NO MARKETING. Each one is the direct consequence of an act by the customer.
 * `price_drop` and `back_in_stock` are the only two that are not transactional
 * and they pass on one test alone: the customer put THIS product on their
 * wishlist and asked. Neither may ever be widened into "products you might
 * like", which is the 30א consent regime and needs a column this table does
 * not have.
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

/** The order page when the payload names an order, the list when it does not. */
export function orderPagePath(payload: Record<string, unknown>): string {
  const orderId = text(payload, 'order_id')
  return orderId ? `/account/orders/${orderId}` : '/account/orders'
}

/**
 * The two link forms every template carries: `url` for the service worker
 * (same-origin path, see the header) and `link` for anything that wants the
 * absolute form.
 */
function links(siteUrl: string, path: string): { url: string; link: string } {
  return { url: path, link: universalLink(siteUrl, path) }
}

function orderPaid(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const total = integer(payload, 'total_agorot')
  const orderId = text(payload, 'order_id')
  return {
    title: 'ההזמנה שלך התקבלה',
    body:
      total !== null && total > 0
        ? `שולמו ${shekelsCompact(total)}. הפרטים, הקבלה והמשלוח בדף ההזמנה.`
        : 'התשלום התקבל. הפרטים, הקבלה והמשלוח בדף ההזמנה.',
    data: {
      kind: 'order_paid',
      path: orderId ? APP_PATHS.order(orderId) : APP_PATHS.home,
      ...links(siteUrl, orderPagePath(payload)),
      order_id: orderId,
      order_ref: text(payload, 'order_ref'),
    },
  }
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
      ? `${count} קופונים מחכים לך בדף ההזמנה. אפשר להציג אותם בבית העסק כבר עכשיו.`
      : productName
        ? `הקופון ל${productName} מוכן. אפשר להציג אותו בבית העסק כבר עכשיו.`
        : 'הקופון שלך מוכן ומחכה בדף ההזמנה.'

  const voucherId = text(first, 'id')
  return {
    title: count > 1 ? 'הקופונים שלך מוכנים' : 'הקופון שלך מוכן',
    body,
    data: {
      kind: 'voucher_issued',
      path: count === 1 && voucherId ? APP_PATHS.coupon(voucherId) : APP_PATHS.coupons,
      ...links(siteUrl, orderPagePath(payload)),
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
  const voucherId = text(payload, 'voucher_id')

  return {
    title: days <= 1 ? 'הקופון שלך פג מחר' : `הקופון שלך פג ${daysInHebrew(days)}`,
    body: productName
      ? `הקופון ל${productName}${where} עדיין לא מומש. שווה לנצל אותו.`
      : `יש לך קופון${where} שעדיין לא מומש.`,
    data: {
      kind: 'voucher_expiring',
      path: voucherId ? APP_PATHS.coupon(voucherId) : APP_PATHS.coupons,
      // The expiry sweep's payload carries the voucher and not the order, so
      // this is the one customer kind whose page is the coupon itself.
      ...links(siteUrl, voucherId ? `/coupon/${voucherId}` : '/account/coupons'),
      voucher_id: voucherId,
    },
  }
}

/**
 * The coupon was scanned at the business.
 *
 * The code is NOT repeated here: it is spent, and a spent code on a lock
 * screen is noise. What matters is the "if this was not you" sentence, which
 * is why this kind is worth a push at all.
 */
function couponRedeemed(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const productName = text(payload, 'product_name')
  const supplier = text(payload, 'supplier_name')
  return {
    title: 'הקופון שלך מומש',
    body: `${productName ? `הקופון ל${productName}` : 'קופון שלך'}${
      supplier ? ` מומש ב${supplier}` : ' מומש'
    }. אם זה לא הייתם אתם, פנו אלינו מיד.`,
    data: {
      kind: 'voucher_redeemed',
      path: APP_PATHS.coupons,
      ...links(siteUrl, orderPagePath(payload)),
      order_id: text(payload, 'order_id'),
    },
  }
}

/** The card credit went through. No date promise: that is the issuer's. */
function refundCompleted(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const refunded = integer(payload, 'refunded_agorot')
  const orderId = text(payload, 'order_id')
  const cancelOnly = payload.cancel_only === true
  return {
    title: cancelOnly ? 'ההזמנה שלך בוטלה' : 'ההחזר שלך בוצע',
    body:
      refunded !== null && refunded > 0
        ? `${shekelsCompact(refunded)} הוחזרו לכרטיס. הפירוט בדף ההזמנה.`
        : 'הפירוט בדף ההזמנה.',
    data: {
      kind: 'refund_completed',
      path: orderId ? APP_PATHS.order(orderId) : APP_PATHS.home,
      ...links(siteUrl, orderPagePath(payload)),
      order_id: orderId,
      refunded_agorot: refunded,
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
      // The credit belongs to an order (finalize names it); the wallet is
      // the fallback for a credit written without one.
      ...links(siteUrl, text(payload, 'order_id') ? orderPagePath(payload) : '/account/wallet'),
      amount_agorot: amount,
      order_id: text(payload, 'order_id'),
    },
  }
}

/**
 * The money behind an expired coupon, back in the wallet. Says "wallet" and
 * "expired" and nothing about a card, for the same honesty reason the mail
 * builder gives: the customer must not go looking for a card credit.
 */
function expiryCredited(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const amount = integer(payload, 'amount_agorot')
  if (amount === null || amount <= 0) return null
  const productName = text(payload, 'product_name')
  return {
    title: `${shekelsCompact(amount)} חזרו לארנק שלך`,
    body: productName
      ? `הקופון ל${productName} פג בלי שמומש, והסכום ששולם עליו חזר לארנק.`
      : 'קופון פג בלי שמומש, והסכום ששולם עליו חזר לארנק.',
    data: {
      kind: 'voucher_expiry_credited',
      path: APP_PATHS.wallet,
      ...links(siteUrl, '/account/wallet'),
      amount_agorot: amount,
    },
  }
}

/** A referral bonus, for either side. Not "cashback": the referrer bought nothing. */
function referralBonus(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const amount = integer(payload, 'amount_agorot')
  if (amount === null || amount <= 0) return null
  const referrer = text(payload, 'role') === 'referrer'
  return {
    title: `בונוס הפניה של ${shekelsCompact(amount)} בארנק`,
    body: referrer
      ? 'מי שהזמנתם קנה, והבונוס שלכם בארנק.'
      : 'הצטרפתם דרך הפניה, והבונוס שלכם בארנק.',
    data: {
      kind: 'referral_bonus_credited',
      path: APP_PATHS.wallet,
      ...links(siteUrl, '/account/wallet'),
      amount_agorot: amount,
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
  const orderId = text(payload, 'order_id')
  const carrier = text(payload, 'carrier')

  return {
    title: 'ההזמנה שלך יצאה לדרך',
    body: carrier
      ? `המשלוח נמסר ל${carrier}. פרטי המעקב מחכים בעמוד ההזמנה.`
      : 'המשלוח יצא. פרטי המעקב מחכים בעמוד ההזמנה.',
    data: {
      kind: 'order_shipped',
      path: orderId ? APP_PATHS.order(orderId) : APP_PATHS.home,
      ...links(siteUrl, orderPagePath(payload)),
      order_id: orderId,
      order_ref: orderRef,
    },
  }
}

/**
 * A saved product got cheaper.
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
      ...links(siteUrl, slug ? `/product/${slug}` : '/products'),
      product_id: text(payload, 'product_id'),
      now_agorot: now,
    },
  }
}

/** A product somebody asked to be told about is back. Refuses without a name. */
function backInStock(payload: Record<string, unknown>, siteUrl: string): PushContent | null {
  const productName = text(payload, 'product_name')
  if (!productName) return null
  const slug = text(payload, 'product_slug')
  return {
    title: `${productName} חזר למלאי`,
    body: 'ביקשתם שנעדכן. הוא זמין שוב, וכמות מוגבלת.',
    data: {
      kind: 'back_in_stock',
      path: APP_PATHS.home,
      ...links(siteUrl, slug ? `/product/${slug}` : '/account/wishlist'),
      product_id: text(payload, 'product_id'),
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
    case 'order_paid':
      return orderPaid(payload, siteUrl)
    case 'voucher_issued':
      return couponPurchased(payload, siteUrl)
    case 'voucher_expiring':
      return couponExpiring(payload, siteUrl)
    case 'voucher_redeemed':
      return couponRedeemed(payload, siteUrl)
    case 'refund_completed':
      return refundCompleted(payload, siteUrl)
    case 'cashback_credited':
      return cashbackCredited(payload, siteUrl)
    case 'voucher_expiry_credited':
      return expiryCredited(payload, siteUrl)
    case 'referral_bonus_credited':
      return referralBonus(payload, siteUrl)
    case 'order_shipped':
      return orderShipped(payload, siteUrl)
    case 'price_drop':
      return priceDrop(payload, siteUrl)
    case 'back_in_stock':
      return backInStock(payload, siteUrl)
    default:
      return null
  }
}

/** The kinds that can ever produce a push. Exported so tests can assert the set. */
export const PUSHABLE_KINDS = [
  'order_paid',
  'voucher_issued',
  'voucher_expiring',
  'voucher_redeemed',
  'refund_completed',
  'cashback_credited',
  'voucher_expiry_credited',
  'referral_bonus_credited',
  'order_shipped',
  'price_drop',
  'back_in_stock',
] as const
