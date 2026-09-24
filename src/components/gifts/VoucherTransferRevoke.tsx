'use client'

import { t } from '@/lib/i18n/messages'
import { revokeVoucherTransfer } from '@/server/actions/gifts'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/** Takes an unclaimed link back. See `revokeVoucherTransfer` for what it undoes. */
export default function VoucherTransferRevoke({ voucherId }: { voucherId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        data-testid="gift-transfer-revoke"
        className="account-btn"
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await revokeVoucherTransfer(voucherId)
            if (result.ok) {
              router.push('/account/coupons')
              router.refresh()
              return
            }
            setError(result.error)
          })
        }
      >
        {pending ? t('giftTransfer.revoking') : t('giftTransfer.revoke')}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
