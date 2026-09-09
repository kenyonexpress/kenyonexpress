import type { CartView } from '@/lib/cart/types'
import { shekels } from '@/lib/money-format'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * The abandoned-cart reminder, as a pure function of the cart and which
 * reminder it is.
 *
 * PURE AND OUT OF THE ROUTE so the copy is testable without a mail provider, a
 * database or a cron secret. The route decides WHO gets mail; this decides what
 * the mail says, and the two questions were tangled in one handler where
 * neither could be tested.
 *
 * THE CART CONTENTS ARE THE MESSAGE. The shipped version said "you have N items
 * in your cart", which is the one thing a person already knows and the one
 * thing that cannot remind them of anything: nobody abandons a cart because
 * they forgot how many things were in it. SECTIONS 26 asks for the contents,
 * and the contents are also what makes the mail worth opening.
 *
 * MONEY IS AGOROT AND IS FORMATTED, NEVER ARITHMETIC. Every figure here comes
 * from `buildCartView`, the same function the cart page and checkout price
 * with, so the mail cannot quote a total the cart would disagree with. Nothing
 * in this file adds, multiplies or divides money.
 *
 * TWO REMINDERS, TWO DIFFERENT SENTENCES. The second is not the first sent
 * again: a person who ignored the first one has already decided not to act on
 * that wording, and repeating it verbatim is what makes the second read as
 * spam rather than as a last note. It also says it is the last one, because
 * saying so is the difference between a bounded sequence and an unbounded one
 * from the reader's side -- they have no other way to know.
 */

export const ABANDONED_CART_MAX_REMINDERS = 2

/** How many lines are itemised before the mail says "and N more". */
const MAX_LINES = 5

export type ReminderNumber = 1 | 2

export interface AbandonedCartEmail {
  subject: string
  html: string
}

/** Minimal HTML escape. Product names are operator content, not ours. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The resume link.
 *
 * `/cart` and not a per-cart token URL: the cart is already keyed to the
 * signed-in account, so the customer's own cart is what /cart shows them. A
 * token link would be a bearer credential to somebody's cart sitting in an
 * inbox forever, which is a real thing to lose and buys nothing here.
 *
 * `utm_*` so PostHog and the analytics tables can tell a recovered visit from
 * an ordinary one without a bespoke parameter nobody else understands.
 */
export function resumeUrl(base: string, reminder: ReminderNumber): string {
  const clean = base.replace(/\/+$/, '')
  return `${clean}/cart?utm_source=email&utm_medium=lifecycle&utm_campaign=abandoned_cart&utm_content=reminder_${reminder}`
}

const SUBJECTS: Record<ReminderNumber, string> = {
  1: 'שכחת משהו בסל?',
  2: 'הסל שלך עדיין שמור, אבל לא לנצח',
}

const OPENERS: Record<ReminderNumber, string> = {
  1: 'שמרנו לך את הסל. הנה מה שיש בו:',
  2: 'זו התזכורת האחרונה שנשלח על הסל הזה. הנה מה שנשאר בו:',
}

export function buildAbandonedCartEmail(options: {
  cart: CartView
  /** Site origin, with or without a trailing slash. */
  base: string
  reminder: ReminderNumber
  /** The recipient's own unsubscribe link. Omitted only when there is none. */
  unsubscribeUrl?: string
}): AbandonedCartEmail {
  const { cart, base, reminder, unsubscribeUrl } = options
  const href = resumeUrl(base, reminder)

  const shown = cart.items.slice(0, MAX_LINES)
  const hidden = cart.items.length - shown.length

  const rows = shown
    .map((item) => {
      const name = escapeHtml(item.name_he)
      // `bdi` around every number: the document is RTL and a bare quantity or
      // price beside Hebrew is re-ordered by the bidi algorithm. This is the
      // same reason the shipped version wrapped its item count.
      const qty = item.quantity > 1 ? ` <bdi>×${item.quantity}</bdi>` : ''
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${OFF_PAGE.rule};text-align:right">${name}${qty}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${OFF_PAGE.rule};text-align:left;white-space:nowrap"><bdi>${shekels(item.line_total)}</bdi></td>
      </tr>`
    })
    .join('')

  const more =
    hidden > 0
      ? `<tr><td colspan="2" style="padding:8px 0;color:${OFF_PAGE.muted};text-align:right">ועוד <bdi>${hidden}</bdi> פריטים</td></tr>`
      : ''

  // The TOTAL is the cart's own `total` -- after any applied coupon -- because
  // that is what the customer will be charged if they follow the link. Quoting
  // the subtotal would promise a number the checkout then contradicts upward.
  const total = `<tr>
      <td style="padding:12px 0 0;font-weight:700;text-align:right">סה"כ</td>
      <td style="padding:12px 0 0;font-weight:700;text-align:left;white-space:nowrap"><bdi>${shekels(cart.total)}</bdi></td>
    </tr>`

  const html = `<div dir="rtl" style="font-family:Heebo,Arial,Helvetica,sans-serif;text-align:right;color:${OFF_PAGE.ink}">
  <h1 style="font-size:20px;margin:0 0 12px">הסל שלך מחכה</h1>
  <p style="margin:0 0 16px">${OPENERS[reminder]}</p>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px">
    <tbody>${rows}${more}${total}</tbody>
  </table>
  <p style="margin:0 0 20px"><a href="${href}" style="background:${OFF_PAGE.brand};color:${OFF_PAGE.ink};font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">חזרה לסל</a></p>
  ${
    unsubscribeUrl
      ? `<p style="color:${OFF_PAGE.muted};font-size:12px;margin:0"><a href="${unsubscribeUrl}" style="color:${OFF_PAGE.muted}">הסרה מרשימת הדיוור</a></p>`
      : ''
  }
</div>`

  return { subject: SUBJECTS[reminder], html }
}
