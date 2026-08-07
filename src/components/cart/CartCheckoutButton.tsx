'use client'

import Link from 'next/link'

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
  return (
    <Link
      href="/checkout"
      className={className}
      onClick={onNavigate}
      aria-disabled={disabled}
      data-disabled={disabled ? '' : undefined}
      data-guest={isAuthenticated ? undefined : ''}
    >
      המשך לתשלום
    </Link>
  )
}
