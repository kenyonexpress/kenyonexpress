'use client'

import { t } from '@/lib/i18n/messages'
import type { AuthState } from '@/server/actions/auth'
import { linkGoogleAfterCheckout } from '@/server/actions/guest-upgrade'
import { useActionState } from 'react'

/**
 * Shown on the paid return page to a guest only (S07). The one place Google is
 * asked for: after the money has moved, to keep this order, the address and
 * the saved card on an account for next time. Skipping it costs nothing; the
 * coupon is already on its way to the email the guest typed.
 */
export default function SaveWithGoogle({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    linkGoogleAfterCheckout,
    null,
  )
  const error = state && 'error' in state ? state.error : null
  return (
    <form action={action} className="checkout-save-account" data-guest-save>
      <input type="hidden" name="next" value={next} />
      <p>{t('checkout.guestSave.prompt')}</p>
      <button type="submit" className="checkout-pay-btn" disabled={pending}>
        {pending ? t('checkout.guestSave.pending') : t('checkout.guestSave.button')}
      </button>
      {error && (
        <div className="checkout-error" role="alert">
          {error}
        </div>
      )}
    </form>
  )
}
