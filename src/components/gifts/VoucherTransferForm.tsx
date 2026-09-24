'use client'

import { t } from '@/lib/i18n/messages'
import { transferVoucher } from '@/server/actions/gifts'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The transfer form. A submit, not a link: sending a coupon on gives a
 * stranger a working claim link, and that has to be a deliberate act with the
 * recipient's address typed by the sender.
 */
export default function VoucherTransferForm({ voucherId }: { voucherId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <form
      className="mt-4 flex flex-col gap-3"
      data-testid="gift-transfer-form"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        startTransition(async () => {
          setError(null)
          const result = await transferVoucher(voucherId, {
            recipientEmail: String(form.get('recipientEmail') ?? ''),
            recipientName: String(form.get('recipientName') ?? '') || undefined,
            message: String(form.get('message') ?? '') || undefined,
          })
          if (result.ok) {
            router.push('/account/coupons')
            router.refresh()
            return
          }
          setError(result.error)
        })
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('giftTransfer.emailLabel')}</span>
        <input
          name="recipientEmail"
          type="email"
          required
          autoComplete="email"
          dir="ltr"
          className="rounded-lg border border-heading/20 px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('giftTransfer.nameLabel')}</span>
        <input
          name="recipientName"
          type="text"
          maxLength={80}
          className="rounded-lg border border-heading/20 px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('giftTransfer.messageLabel')}</span>
        <textarea
          name="message"
          rows={3}
          maxLength={500}
          className="rounded-lg border border-heading/20 px-3 py-2 text-base"
        />
      </label>
      <div>
        <button type="submit" disabled={pending} className="account-btn account-btn--primary">
          {pending ? t('giftTransfer.submitting') : t('giftTransfer.submit')}
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
