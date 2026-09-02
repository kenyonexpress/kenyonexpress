'use client'

import { submitReview } from '@/server/actions/reviews'
import { useState, useTransition } from 'react'

/**
 * Shown only to a verified buyer with an unspent review slot -- the server
 * gate is <Reviews>, which renders this with the order_item to spend. The
 * INSERT policy re-verifies everything; this form cannot grant itself
 * anything by lying.
 */
export default function ReviewForm({
  productId,
  orderItemId,
}: {
  productId: string
  orderItemId: string
}) {
  const [rating, setRating] = useState(5)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (done) {
    return (
      <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
        תודה! הביקורת נשלחה ותופיע אחרי אישור.
      </output>
    )
  }

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await submitReview(formData)
      if (result.ok) setDone(true)
      else setError(result.error ?? 'שמירת הביקורת נכשלה.')
    })
  }

  return (
    <form action={onSubmit} className="space-y-3 rounded-lg border border-gray-200 p-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <p className="text-sm font-semibold">קנית את המוצר? ספר לנו איך היה</p>
      <fieldset className="border-0 p-0">
        <legend className="sr-only">דירוג</legend>
        <div className="flex flex-row-reverse justify-end gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`text-2xl ${value <= rating ? 'text-primary' : 'text-gray-300'}`}
              >
                ★
              </span>
              <span className="sr-only">{value} כוכבים</span>
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        name="body"
        maxLength={1000}
        rows={3}
        placeholder="מה חשוב שקונים אחרים יידעו? (לא חובה)"
        className="w-full rounded-lg border border-gray-200 p-2 text-sm"
      />
      {error ? (
        <output aria-live="assertive" className="block text-sm text-price">
          {error}
        </output>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-gray-900 disabled:opacity-50"
      >
        {isPending ? 'שולח…' : 'שליחת ביקורת'}
      </button>
    </form>
  )
}
