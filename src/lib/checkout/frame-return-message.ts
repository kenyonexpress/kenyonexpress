/**
 * How the payment frame tells the checkout page that the payment is over.
 *
 * The hosted payment page runs in an iframe whose sandbox deliberately lacks
 * `allow-top-navigation`: a page we do not own must not be able to move the
 * shopper's tab. The cost, measured on the 2026-09-21 go-live dry run, was that
 * OUR OWN /checkout/frame-return, which Cardcom returns to inside that frame,
 * could not move the tab either. `window.top.location.replace()` threw a
 * SecurityError, the fallback navigated the frame itself to /checkout/return,
 * `frame-ancestors 'none'` blanked it, and the shopper was left looking at the
 * checkout with an empty payment box while the order was already paid, the
 * voucher issued and the invoice written.
 *
 * So the frame does not navigate the tab. It tells the parent, and the parent
 * navigates itself, which no sandbox restricts. The message is same-origin
 * only, the parent checks the origin again, and the target is a path under
 * /checkout/, never a URL: a message cannot send the tab anywhere else.
 */

export const PAYMENT_RETURN_MESSAGE = 'kenyon:payment-return' as const

export type PaymentReturnMessage = {
  type: typeof PAYMENT_RETURN_MESSAGE
  target: string
}

export function paymentReturnMessage(target: string): PaymentReturnMessage {
  return { type: PAYMENT_RETURN_MESSAGE, target }
}

/** A path on this site under /checkout/. Absolute URLs and protocol-relative
 *  paths are refused, and so is anything that would escape the section. */
export function isCheckoutPath(target: unknown): target is string {
  if (typeof target !== 'string') return false
  if (!target.startsWith('/checkout/')) return false
  if (target.startsWith('//')) return false
  for (const char of target) {
    // A backslash or a control character has no place in a path we will
    // navigate to; a regex would say the same but Biome forbids the class.
    if (char === '\\' || char.charCodeAt(0) < 0x20) return false
  }
  return true
}

/**
 * The target the parent should navigate to, or null when the message is not
 * ours: wrong origin, wrong shape, or a target that is not a checkout path.
 */
export function paymentReturnTarget(
  data: unknown,
  messageOrigin: string,
  ownOrigin: string,
): string | null {
  if (messageOrigin !== ownOrigin) return null
  if (!data || typeof data !== 'object') return null
  const message = data as { type?: unknown; target?: unknown }
  if (message.type !== PAYMENT_RETURN_MESSAGE) return null
  return isCheckoutPath(message.target) ? message.target : null
}
