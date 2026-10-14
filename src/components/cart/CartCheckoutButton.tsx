'use client'

import Link, { useLinkStatus } from 'next/link'

export const CHECKOUT_PENDING_LABEL = 'עוברים לקופה…'

/**
 * The press acknowledged (UX27). /checkout is a dynamic route whose shell is
 * not always prefetched by the time the button is pressed: measured on a
 * built server, the URL changed 306-724ms after the press at 380 / 768 / 1440
 * and the cart page stood still until then (logs/ux27/before.json). The ring
 * is always in the document at a fixed size and only its opacity changes, so
 * the label never moves; the live region names the wait for a screen reader.
 */
function CheckoutLinkPending() {
  const { pending } = useLinkStatus()
  return (
    <>
      <span
        className="checkout-link__hint"
        aria-hidden="true"
        data-link-pending={pending ? 'true' : 'false'}
      />
      <output className="sr-only" aria-live="polite">
        {pending ? CHECKOUT_PENDING_LABEL : ''}
      </output>
    </>
  )
}

export default function CartCheckoutButton({
  isAuthenticated,
  disabled,
  className = 'cart-checkout-btn',
  onNavigate,
}: {
  isAuthenticated: boolean
  disabled?: boolean
  /** Lets the drawer keep its own button styling while sharing the auth gate. */
  className?: string
  onNavigate?: () => void
}) {
  // Both states are the same link now. The login used to happen here, which
  // made an account the first thing asked of someone who had not yet seen a
  // shipping form, and /checkout bounced anyone anonymous straight back to this
  // button. Checkout takes guests; the identity is demanded on the pay press,
  // where there is something to lose by walking away.
  //
  // THE DISABLED STATE HAS TO BE ENFORCED HERE, NOT ONLY IN CSS.
  //
  // `aria-disabled` on an anchor says "disabled" and stops nothing: the CSS
  // carries `pointer-events: none`, which blocks the mouse and does not touch
  // the keyboard. The link keeps its place in the tab order, so a shopper with
  // an unavailable item could tab to it, press Enter, and land on the checkout;
  // the browser fires a click for Enter on a link, so one preventDefault covers
  // both routes in.
  //
  // The money is not at risk either way - `beginCheckout` rebuilds the cart on
  // the server and refuses it through the same `validateCartView` - but the
  // refusal would arrive after the whole form was filled in, which is the worst
  // moment to learn that an item went out of stock.
  return (
    <Link
      href="/checkout"
      className={className}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault()
          return
        }
        onNavigate?.()
      }}
      aria-disabled={disabled}
      data-disabled={disabled ? '' : undefined}
      data-guest={isAuthenticated ? undefined : ''}
      data-checkout-link=""
    >
      המשך לתשלום
      <CheckoutLinkPending />
    </Link>
  )
}
