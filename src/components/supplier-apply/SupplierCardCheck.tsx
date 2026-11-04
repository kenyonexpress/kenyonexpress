'use client'

import { t } from '@/lib/i18n/messages'
import { type CardCheckState, startSupplierCardCheck } from '@/server/actions/supplier-card-check'
import { useActionState } from 'react'

const EMPTY: CardCheckState = { ok: false }

/**
 * The 1 ILS card check, one button. Rendered by `/supplier/apply` only while the
 * payment provider is the sandbox; the action refuses on its own otherwise.
 */
export default function SupplierCardCheck({
  applicationId,
  verifiedLast4,
}: {
  applicationId: string
  /** Set when a verified check already exists; the button is not offered again. */
  verifiedLast4: string | null | undefined
}) {
  const [state, action, pending] = useActionState(startSupplierCardCheck, EMPTY)

  if (verifiedLast4 !== undefined || state.ok) {
    return (
      <output className="mt-3 block text-sm text-body">
        {state.message ??
          (verifiedLast4
            ? t('supplierJoin.cardCheckDoneLast4').replace('{last4}', verifiedLast4)
            : t('supplierJoin.cardCheckDone'))}
      </output>
    )
  }

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="application_id" value={applicationId} />
      <p className="text-sm text-body">{t('supplierJoin.cardCheckIntro')}</p>
      <button
        type="submit"
        className="account-btn mt-3 min-h-11"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? t('supplierJoin.cardCheckPending') : t('supplierJoin.cardCheckButton')}
      </button>
      {state.error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
