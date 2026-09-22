'use client'

import { REVIEW_BODY_MAX } from '@/lib/reviews/eligibility'
import { submitReview } from '@/server/actions/reviews'
import { useState, useTransition } from 'react'

export default function ReviewForm({
  orderItemId,
  productId,
  productName,
}: {
  orderItemId: string
  productId: string
  productName: string
}) {
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit() {
    setMessage(null)
    startTransition(async () => {
      const result = await submitReview({
        orderItemId,
        productId,
        rating,
        body: body.trim() === '' ? null : body.trim(),
      })
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      setDone(true)
      setMessage('הביקורת נשלחה וממתינה לאישור.')
    })
  }

  if (done) {
    return (
      <output className="account-row__meta" aria-live="polite">
        {message}
      </output>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm font-semibold text-heading">ביקורת על {productName}</p>
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0">
        <legend className="sr-only">דירוג</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            aria-pressed={rating === value}
            aria-label={`${value} מתוך 5`}
            className="min-h-11 min-w-11 rounded-lg border border-border px-2 text-sm font-semibold text-heading hover:bg-surface-2"
          >
            {value}
          </button>
        ))}
      </fieldset>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value.slice(0, REVIEW_BODY_MAX))}
        maxLength={REVIEW_BODY_MAX}
        rows={3}
        dir="rtl"
        className="w-full rounded-lg border border-border px-3 py-2 text-start text-sm"
        placeholder="מה היה טוב, ומה פחות (לא חובה)"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending}
        className="min-h-11 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-brand-dark disabled:opacity-60"
      >
        {pending ? 'שולחים…' : 'שליחת ביקורת'}
      </button>
      {message ? (
        <output className="block text-sm text-muted" aria-live="polite">
          {message}
        </output>
      ) : null}
    </div>
  )
}
