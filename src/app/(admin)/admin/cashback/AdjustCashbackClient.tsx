'use client'

import { adjustCashback } from '@/server/actions/admin/cashback'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

/**
 * The adjustment form. One idempotency key per submission attempt, minted
 * when the admin presses the button and kept until the action answers, so a
 * double click or a retried network request is one wallet movement, not two.
 */
export default function AdjustCashbackClient() {
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [amountIls, setAmountIls] = useState('')
  const [reason, setReason] = useState('')
  const [key, setKey] = useState<string>(() => crypto.randomUUID())

  function submit() {
    startTransition(async () => {
      const result = await adjustCashback({ email, amountIls, reason, idempotencyKey: key })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.success ?? 'בוצע')
      // A fresh key only after success: the next submission is a new intent.
      setKey(crypto.randomUUID())
      setEmail('')
      setAmountIls('')
      setReason('')
    })
  }

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">אימייל הלקוח</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="customer@example.com"
          dir="ltr"
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">סכום בשקלים (שלילי לקיזוז)</span>
        <input
          type="text"
          required
          inputMode="decimal"
          value={amountIls}
          onChange={(e) => setAmountIls(e.target.value)}
          placeholder="12.50 או -12.50"
          dir="ltr"
          className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">נימוק (נרשם ביומן)</span>
        <input
          type="text"
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="פיצוי על איחור במשלוח, תיקון זיכוי כפול..."
          className="min-w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
      >
        {pending ? 'מבצע...' : 'בצע התאמה'}
      </button>
    </form>
  )
}
