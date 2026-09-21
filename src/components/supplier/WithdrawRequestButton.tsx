'use client'

import { t } from '@/lib/i18n/messages'
import { withdrawImageSubmission } from '@/server/actions/supplier/image-submission'
import { withdrawPriceProposal } from '@/server/actions/supplier/price-proposal'
import { useState, useTransition } from 'react'

/** Withdraw a pending price proposal or image submission. */
export default function WithdrawRequestButton({
  id,
  kind,
}: {
  id: string
  kind: 'price' | 'image'
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result =
              kind === 'price' ? await withdrawPriceProposal(id) : await withdrawImageSubmission(id)
            setError(result.ok ? null : (result.error ?? ''))
          })
        }
        className="min-h-11 text-xs font-semibold text-gray-500 underline disabled:opacity-60"
      >
        {t('supplier.withdraw')}
      </button>
      {error ? <output className="mt-1 block text-xs text-red-700">{error}</output> : null}
    </div>
  )
}
