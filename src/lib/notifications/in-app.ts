/**
 * The in-app notification centre's content, and the list of kinds that reach it.
 *
 * =========================================================================
 * WHY THIS EXISTS AT ALL: THE TABLE HAD NO WRITER
 * =========================================================================
 *
 * 198 shipped `notifications`, its RLS, its indexes, `REPLICA IDENTITY FULL`
 * and membership of the `supabase_realtime` publication. The bell reads it, the
 * account page reads it, the realtime subscription is live. **Nothing has ever
 * written a row into it.** Measured 2026-09-09: the only statements against the
 * table anywhere in the repository are two SELECTs and one UPDATE of `read_at`.
 *
 * So the centre was a complete, correct, permanently empty feature. This module
 * is the missing half: the outbox already receives every event, in-transaction,
 * from the triggers in 095, and this turns the customer-facing ones into rows.
 *
 * =========================================================================
 * A FOURTH LEG ON THE SAME QUEUE, NOT A SECOND QUEUE
 * =========================================================================
 *
 * The drain already fans one outbox row out to email, push and WhatsApp. In-app
 * is the fourth, and it must not be a separate pipeline: two pipelines over the
 * same events is two chances to disagree about whether an event happened, and
 * the disagreement always surfaces as a customer who was emailed about a
 * voucher the site says they do not have.
 *
 * =========================================================================
 * WHAT DOES NOT REACH THE CENTRE, AND WHY THE LIST IS AN ALLOWLIST
 * =========================================================================
 *
 * An allowlist, not a denylist, because the failure directions are not
 * symmetric. A customer-facing kind that is missing here shows up as a
 * notification nobody got, which is a gap somebody reports. An OPERATOR kind
 * that leaks through shows up as `reconciliation_gap: settlement short by
 * ₪4,102` in a shopper's bell, which is an internal finance figure published to
 * a stranger. A new kind therefore reaches nobody until somebody adds it here.
 *
 * `supplier_sale`, `invoice_dead`, `low_stock`, `reconciliation_gap` and
 * `settlement_gap` are the kinds that must never appear: the first goes to a
 * business rather than a person, and the rest go to a fixed operator address.
 * `notification_outbox.user_id` is null for them anyway, which is a second
 * refusal on the same fact, and the drain checks that too.
 */

/** Payload readers, deliberately narrow: an absent key is null, never a crash. */
function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function integer(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

/** Agorot to a short shekel string. Same shape the push templates use. */
function shekels(agorot: number): string {
  const whole = Math.trunc(Math.abs(agorot) / 100)
  const fraction = Math.abs(agorot) % 100
  const sign = agorot < 0 ? '-' : ''
  return fraction === 0
    ? `${sign}₪${whole.toLocaleString('he-IL')}`
    : `${sign}₪${whole.toLocaleString('he-IL')}.${String(fraction).padStart(2, '0')}`
}

export interface InAppContent {
  title_he: string
  body_he: string | null
  /**
   * An in-app path, never an absolute URL. The row is rendered by our own
   * client into a `<Link>`, so a host here would be both redundant and a place
   * for an open redirect to hide.
   */
  href: string | null
}

/**
 * Every kind that may appear in a customer's notification centre.
 *
 * Exported so a test can assert the set rather than infer it from the switch,
 * and so the operator kinds can be asserted ABSENT.
 */
export const IN_APP_KINDS = [
  'order_paid',
  'order_shipped',
  'voucher_issued',
  'voucher_gifted',
  'voucher_expiring',
  'voucher_expiry_credited',
  'voucher_redeemed',
  'refund_completed',
  'cashback_credited',
  'price_drop',
  'back_in_stock',
  'welcome',
] as const

export type InAppKind = (typeof IN_APP_KINDS)[number]

export function isInAppKind(kind: string): kind is InAppKind {
  return (IN_APP_KINDS as readonly string[]).includes(kind)
}

/**
 * The row content for one outbox event, or null when the kind owes nothing.
 *
 * Null is a SETTLED answer and not a failure: the caller records the leg as
 * having nothing to do rather than retrying it forever.
 */
export function buildInAppContent(
  kind: string,
  payload: Record<string, unknown>,
): InAppContent | null {
  if (!isInAppKind(kind)) return null

  switch (kind) {
    case 'order_paid': {
      const total = integer(payload, 'total_agorot')
      return {
        title_he: 'ההזמנה שלך התקבלה',
        body_he: total === null ? null : `שולמו ${shekels(total)}.`,
        href: '/account/orders',
      }
    }
    case 'order_shipped': {
      // The trigger writes `shipments: [{carrier, tracking_number}]`, one entry
      // per line that HAS a number, and no top-level `tracking_number` at all
      // (`tg_orders_notify_shipped`, read from production 2026-09-10). Reading
      // the flat key left this body empty on every shipped order.
      //
      // The carrier is named and the number is not, for the reason the SMS and
      // push bodies give: a long LTR tracking number inside an RTL sentence
      // renders in a plausible but wrong order, and a wrong number is worse
      // than none because the customer types it into a courier's site and is
      // told it does not exist. It is on the order page, isolated properly.
      const shipments = Array.isArray(payload.shipments) ? payload.shipments : []
      const first = (shipments[0] ?? null) as Record<string, unknown> | null
      const carrier = first ? text(first, 'carrier') : null
      return {
        title_he: 'ההזמנה שלך נשלחה',
        body_he: carrier ? `נשלח עם ${carrier}. פרטי המעקב בעמוד ההזמנה.` : null,
        href: '/account/orders',
      }
    }
    case 'voucher_issued': {
      const count = Array.isArray(payload.vouchers) ? payload.vouchers.length : null
      return {
        title_he: count && count > 1 ? `${count} שוברים מוכנים לך` : 'השובר שלך מוכן',
        body_he: 'אפשר להציג אותו בבית העסק.',
        href: '/account/coupons',
      }
    }
    case 'voucher_gifted':
      return {
        title_he: 'קיבלת שובר במתנה',
        body_he: text(payload, 'sender_name'),
        href: '/account/coupons',
      }
    case 'voucher_expiring': {
      // `days_remaining`, NOT `days_left`. The key was measured against
      // production on 2026-09-10: `enqueue_expiring_voucher_notices` builds
      // the payload with `'days_remaining', v_bucket`, and the email and push
      // legs both read that name. In-app read a key that is never present, so
      // `days` was always null and the body always said "it expires today" --
      // including for the seven-day bucket, which is the one that runs most
      // often. Not a missing detail: a customer told a voucher expires today
      // when it expires next week goes to the shop for nothing.
      const days = integer(payload, 'days_remaining')
      return {
        title_he: 'שובר שלך עומד לפוג',
        // Hebrew has a real dual, so "נותרו 1 ימים" and "נותרו 2 ימים" both
        // read wrong. Same three forms the push leg uses.
        body_he:
          days === null || days <= 0
            ? 'הוא פג היום.'
            : days === 1
              ? 'הוא פג מחר.'
              : days === 2
                ? 'הוא פג בעוד יומיים.'
                : `הוא פג בעוד ${days} ימים.`,
        href: '/account/coupons',
      }
    }
    case 'voucher_expiry_credited': {
      // The other half of `voucher_expiring`. That one warns; this one reports
      // what happened to the money when the warning was not acted on.
      //
      // `href` is the WALLET and not `/account/coupons`. The coupon is dead and
      // there is nothing to do on its page; the money is on the wallet page and
      // that is the only thing the customer can now act on. A notification whose
      // link goes somewhere with no action on it is a notification that teaches
      // people not to tap them.
      const amount = integer(payload, 'amount_agorot')
      if (amount === null || amount <= 0) return null
      return {
        title_he: 'הכסף על קופון שפג חזר אליך',
        body_he: `${shekels(amount)} נוספו לארנק.`,
        href: '/account/wallet',
      }
    }
    case 'voucher_redeemed':
      return {
        title_he: 'השובר מומש',
        body_he: text(payload, 'supplier_name'),
        href: '/account/coupons',
      }
    case 'refund_completed': {
      // `refunded_agorot` is what `refundOrder` enqueues, measured against the
      // call site. `amount_agorot` is what `cashback_credited` uses, and
      // reading it here left every refund notification with an empty body.
      // Both names are accepted rather than only the right one: this row is
      // the customer's record that money came back, and a body that is blank
      // because of a key is worse than one filled from either spelling.
      const amount = integer(payload, 'refunded_agorot') ?? integer(payload, 'amount_agorot')
      return {
        title_he: 'הזיכוי בוצע',
        // Signed on the wire in some payloads; a refund is always a return TO
        // the customer, so it is presented as a positive amount.
        body_he: amount === null ? null : `${shekels(Math.abs(amount))} חזרו אליך.`,
        href: '/account/orders',
      }
    }
    case 'cashback_credited': {
      const amount = integer(payload, 'amount_agorot')
      return {
        title_he: 'נכנס לך קאשבק',
        body_he: amount === null ? null : `${shekels(amount)} נוספו לארנק.`,
        href: '/account/wallet',
      }
    }
    case 'price_drop': {
      const was = integer(payload, 'saved_agorot')
      const now = integer(payload, 'now_agorot')
      const name = text(payload, 'product_name')
      const slug = text(payload, 'product_slug')
      // A "drop" that is not a drop is not sent at all, rather than sent with a
      // sentence that reads as a price rise.
      if (was === null || now === null || now >= was || now < 0) return null
      return {
        title_he: name ? `${name} בזול יותר` : 'מוצר שאהבת בזול יותר',
        body_he: `המחיר ירד מ-${shekels(was)} ל-${shekels(now)}.`,
        href: slug ? `/product/${slug}` : '/account/wishlist',
      }
    }
    case 'back_in_stock': {
      const name = text(payload, 'product_name')
      const slug = text(payload, 'product_slug')
      return {
        title_he: name ? `${name} חזר למלאי` : 'מוצר שחיכית לו חזר למלאי',
        body_he: null,
        href: slug ? `/product/${slug}` : '/account/wishlist',
      }
    }
    case 'welcome':
      return {
        title_he: 'ברוכים הבאים לקניון אקספרס',
        body_he: 'כאן יופיעו העדכונים על ההזמנות והשוברים שלך.',
        href: '/account',
      }
    default:
      return null
  }
}
