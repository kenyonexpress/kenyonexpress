'use client'

import { t } from '@/lib/i18n/messages'
import { type JoinAffiliateState, joinAffiliateProgram } from '@/server/actions/affiliates'
import { useActionState } from 'react'

/**
 * The one action on the affiliate page for a customer who has not joined:
 * an optional "where will you share" line and the button. The row it creates
 * starts at pending_review; approval is the admin's, on /admin/affiliates.
 */
export default function AffiliateJoinForm() {
  const [state, action, pending] = useActionState<JoinAffiliateState | null, FormData>(
    joinAffiliateProgram,
    null,
  )

  return (
    <form action={action} className="affiliate-join" data-testid="affiliate-join-form">
      <p className="account-empty">{t('affiliate.joinIntro')}</p>
      <label className="affiliate-join__field">
        {t('affiliate.joinChannel')}
        <input name="channel" className="affiliate-join__input" maxLength={300} dir="auto" />
      </label>
      {state && !state.ok && (
        <p className="affiliate-join__error" role="alert">
          {state.error ?? t('affiliate.joinFailed')}
        </p>
      )}
      <button type="submit" className="account-btn account-btn--primary" disabled={pending}>
        {pending ? t('affiliate.joinPending') : t('affiliate.joinButton')}
      </button>
    </form>
  )
}
