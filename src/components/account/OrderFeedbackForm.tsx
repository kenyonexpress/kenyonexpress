'use client'

import { FEEDBACK_BODY_MAX, feedbackRatingLabel, feedbackStars } from '@/lib/orders/feedback'
import { submitOrderFeedback } from '@/server/actions/order-feedback'
import { useState, useTransition } from 'react'
import type { FormEvent } from 'react'

/**
 * "How did this order go?" on the customer's own order page.
 *
 * Shown for a paid order only (the page decides), and shown once: with a row
 * already stored it renders that row read-only, because the message has
 * already reached the owner and an edit would make the two disagree. The
 * INSERT policy re-checks the order on the server; this form cannot grant
 * itself anything by lying.
 *
 * The line under the title is the whole promise of the feature and is
 * rendered in every state: the text goes to the shop and nowhere else.
 */
export interface OrderFeedbackFormProps {
  orderId: string
  existing: { rating: number; body: string | null; createdAt: string } | null
  /** Pre-formatted, since the server has the locale and the client has not. */
  existingDate?: string | null
}

const PRIVATE_NOTE = 'המשוב פרטי: הוא נשלח לצוות קניון אקספרס בלבד ולא מתפרסם באתר.'

export default function OrderFeedbackForm({
  orderId,
  existing,
  existingDate = null,
}: OrderFeedbackFormProps) {
  const [rating, setRating] = useState<number | null>(null)
  const [done, setDone] = useState<{ rating: number; body: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const stored = existing ?? done
  if (stored) {
    return (
      <div className="account-feedback" data-state="sent">
        <output className="account-feedback__sent">
          <span className="account-feedback__stars" aria-hidden="true">
            {feedbackStars(stored.rating)}
          </span>
          <span className="sr-only">{stored.rating} מתוך 5</span>
          <span>
            {' '}
            {feedbackRatingLabel(stored.rating)}
            {existing && existingDate ? ` · נשלח ב-${existingDate}` : ''}
          </span>
        </output>
        {stored.body && <p className="account-feedback__body">{stored.body}</p>}
        <p className="account-feedback__note">
          {existing ? 'תודה על המשוב. ' : 'תודה! המשוב נשלח. '}
          {PRIVATE_NOTE}
        </p>
      </div>
    )
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    if (rating === null) {
      setError('בחרו דירוג בין 1 ל-5')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitOrderFeedback(formData)
      if (result.ok) {
        const body = formData.get('body')
        setDone({
          rating,
          body: typeof body === 'string' && body.trim() ? body.trim() : null,
        })
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form className="account-feedback" onSubmit={onSubmit} data-state="open">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="account-feedback__note">{PRIVATE_NOTE}</p>

      <fieldset className="account-feedback__rating">
        <legend className="account-field__label">
          איך הייתה חוויית ההזמנה?
          {rating !== null && (
            <span className="account-feedback__legend-word"> {feedbackRatingLabel(rating)}</span>
          )}
        </legend>
        {/* Plain flex: the document is RTL, so star 1 renders on the right
            and the scale reads 1..5 the way a Hebrew reader expects. The
            fill is driven by value <= rating, not by sibling selectors. */}
        <div className="account-feedback__stars-row">
          {[1, 2, 3, 4, 5].map((value) => (
            <label className="account-feedback__star" key={value}>
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
                required
              />
              <span
                aria-hidden="true"
                className="account-feedback__star-glyph"
                data-filled={rating !== null && value <= rating ? 'true' : 'false'}
              >
                ★
              </span>
              <span className="sr-only">
                {value} כוכבים, {feedbackRatingLabel(value)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="account-field">
        <label className="account-field__label" htmlFor={`feedback-body-${orderId}`}>
          מה היה טוב ומה כדאי לשפר? (לא חובה)
        </label>
        <textarea
          className="account-field__input account-feedback__textarea"
          id={`feedback-body-${orderId}`}
          name="body"
          maxLength={FEEDBACK_BODY_MAX}
          rows={3}
          placeholder="המשלוח, האריזה, השירות בבית העסק..."
        />
      </div>

      {error && (
        <p className="account-feedback__error" role="alert">
          {error}
        </p>
      )}

      <div>
        <button className="account-btn account-btn--primary" type="submit" disabled={isPending}>
          {isPending ? 'שולח...' : 'שליחת משוב'}
        </button>
      </div>
    </form>
  )
}
