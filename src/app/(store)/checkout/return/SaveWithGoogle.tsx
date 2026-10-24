'use client'

import { type AuthState, linkGoogleAfterCheckout } from '@/server/actions/auth'
import { useActionState } from 'react'

/**
 * Shown on the paid return page to a guest only. The one place Google is asked
 * for: after the money has moved, to keep the details and the tokenized card
 * for one-tap repeat purchases. Skipping it costs nothing.
 */
export default function SaveWithGoogle({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    linkGoogleAfterCheckout,
    null,
  )
  const error = state && 'error' in state ? state.error : null
  return (
    <form action={action} className="checkout-save-account">
      <input type="hidden" name="next" value={next} />
      <p>שמרו את הפרטים והכרטיס לקנייה הבאה בלחיצה אחת</p>
      <button type="submit" className="checkout-pay-btn" disabled={pending}>
        {pending ? 'מעביר להתחברות...' : 'שמירה עם Google'}
      </button>
      {error && (
        <div className="checkout-error" role="alert">
          {error}
        </div>
      )}
    </form>
  )
}
