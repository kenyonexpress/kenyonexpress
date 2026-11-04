'use client'

import TurnstileWidget from '@/components/fraud/TurnstileWidget'
import TurnstileRefresh from '@/components/turnstile/TurnstileRefresh'
import { t } from '@/lib/i18n/messages'
import {
  type ChallengeState,
  passSupplierApplyChallenge,
} from '@/server/actions/supplier-onboarding'
import { useActionState } from 'react'

/**
 * The security check in front of the supplier application wizard.
 *
 * Only rendered when a Turnstile key pair is configured and the caller holds no
 * live pass. The wizard's own form is frozen, so the challenge is solved here
 * and the action turns it into a 30-minute cookie that the wizard's submit
 * action checks. `lib/turnstile/verify.ts` has the full reasoning.
 */
export default function SupplierApplyChallenge() {
  const [state, action, pending] = useActionState<ChallengeState, FormData>(
    passSupplierApplyChallenge,
    {},
  )

  return (
    <form action={action} className="mt-6 space-y-4 rounded-lg border border-border bg-white p-5">
      <h2 className="text-lg font-semibold text-heading">{t('turnstile.gateTitle')}</h2>
      <p className="text-sm text-body">{t('turnstile.gateBody')}</p>

      <TurnstileWidget action="supplier_apply" />
      <TurnstileRefresh resetOn={state} />

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? 'בודקים...' : 'המשך לטופס'}
      </button>
    </form>
  )
}
