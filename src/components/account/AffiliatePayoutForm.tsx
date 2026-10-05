'use client'

import { formatIls } from '@/lib/account/format'
import { t } from '@/lib/i18n/messages'
import { agorot } from '@/lib/money'
import { type PayoutRequestState, requestAffiliatePayout } from '@/server/actions/affiliates'
import { useActionState } from 'react'

/**
 * The payout request: one optional line to the operator and one button that
 * names the amount. The amount is not a field, on purpose: the server fixes
 * it from the same reads the page made (see `requestAffiliatePayout`), and a
 * field would be a second place for the same number to be wrong.
 */
export default function AffiliatePayoutForm({ requestableAgorot }: { requestableAgorot: number }) {
  const [state, action, pending] = useActionState<PayoutRequestState | null, FormData>(
    requestAffiliatePayout,
    null,
  )

  if (state?.ok) {
    return (
      <p className="affiliate-payout__sent" data-testid="affiliate-payout-sent">
        {t('affiliate.payoutSent')}
      </p>
    )
  }

  return (
    <form action={action} className="affiliate-join" data-testid="affiliate-payout-form">
      <label className="affiliate-join__field">
        {t('affiliate.payoutNote')}
        <input name="note" className="affiliate-join__input" maxLength={300} dir="auto" />
      </label>
      {state && !state.ok && (
        <p className="affiliate-join__error" role="alert">
          {state.error ?? t('affiliate.payoutFailed')}
        </p>
      )}
      <button type="submit" className="account-btn account-btn--primary" disabled={pending}>
        {pending
          ? t('affiliate.payoutPending')
          : t('affiliate.payoutButton').replace('{amount}', formatIls(agorot(requestableAgorot)))}
      </button>
    </form>
  )
}
