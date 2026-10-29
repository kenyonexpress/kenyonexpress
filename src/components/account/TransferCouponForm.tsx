'use client'

import { transferVoucher } from '@/server/actions/vouchers/transfer-voucher'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/** Hand a coupon to another customer by email. The server decides everything. */
export default function TransferCouponForm({ voucherId }: { voucherId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" className="account-btn" onClick={() => setOpen(true)}>
        העברת הקופון
      </button>
    )
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError(null)
    startTransition(async () => {
      const outcome = await transferVoucher({ voucherId, email })
      if (outcome.ok) router.refresh()
      else setError(outcome.error)
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <label className="block">
        <span className="account-row__meta">אימייל של המקבל/ת (חייב/ת להיות רשום/ה באתר)</span>
        <input
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-border p-2"
        />
      </label>
      <p className="account-row__meta">לאחר ההעברה הקופון יוצג רק אצל המקבל/ת ולא ניתן להחזירו.</p>
      {error && (
        <p role="alert" className="account-row__meta">
          {error}
        </p>
      )}
      <button type="submit" className="account-btn" disabled={pending || !email}>
        {pending ? 'מעביר…' : 'אישור העברה'}
      </button>
    </form>
  )
}
