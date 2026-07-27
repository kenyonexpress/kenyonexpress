'use client'

import { type AuthState, signInWithGoogle } from '@/server/actions/auth'
import Link from 'next/link'
import { useActionState } from 'react'

function getError(state: AuthState): string | null {
  return state && 'error' in state ? state.error : null
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
  const [googleState, googleAction, googlePending] = useActionState<AuthState, FormData>(
    signInWithGoogle,
    null,
  )

  if (isAuthenticated) {
    return (
      <Link
        href="/checkout"
        className={className}
        onClick={onNavigate}
        aria-disabled={disabled}
        data-disabled={disabled ? '' : undefined}
      >
        המשך לתשלום
      </Link>
    )
  }

  const error = getError(googleState)

  return (
    <div className="cart-checkout-wrap">
      {error && <p className="cart-checkout-error">{error}</p>}
      <form action={googleAction}>
        <input type="hidden" name="next" value="/checkout" />
        <button type="submit" className={className} disabled={disabled || googlePending}>
          {googlePending ? 'מעביר להתחברות...' : 'המשך לתשלום — התחברות עם Google'}
        </button>
      </form>
    </div>
  )
}
