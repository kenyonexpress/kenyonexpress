'use client'

import { type SupportState, openOrderTicket } from '@/server/actions/support'
import Link from 'next/link'
import { useActionState, useId, useState } from 'react'

const EMPTY: SupportState = { ok: false }

/**
 * "Something is wrong with this order", from the order itself.
 *
 * THE POINT IS THAT NOTHING IS RETYPED. Opening a ticket from here carries the
 * order id, so the operator does not ask "which order" and the customer does
 * not copy a UUID out of an email. That one link is most of the value of a
 * support desk over an inbox.
 *
 * A SECOND SUBMISSION ADDS TO THE EXISTING TICKET rather than being refused.
 * Three tickets about one order are three operators reading the same history
 * and answering in three places, and a customer who submits twice meant to say
 * more, not to start again.
 */

const CATEGORIES = [
  { value: 'order_status', label: 'איפה ההזמנה שלי' },
  { value: 'voucher_problem', label: 'בעיה בשובר או בסריקה בבית העסק' },
  { value: 'payment', label: 'בעיה בתשלום או בחיוב' },
  { value: 'refund', label: 'שאלה על החזר' },
  { value: 'other', label: 'משהו אחר' },
]

export default function OrderHelpForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(openOrderTicket, EMPTY)
  const [open, setOpen] = useState(false)
  const baseId = useId()

  if (state.ok) {
    return (
      <section className="account-card" dir="rtl">
        <h2 className="account-card__title">עזרה בהזמנה</h2>
        <output className="account-note">{state.message}</output>
        {state.ticketId && (
          <p>
            <Link className="account-btn" href={`/account/tickets/${state.ticketId}`}>
              למעקב אחרי הפנייה
            </Link>
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="account-card" dir="rtl">
      <h2 className="account-card__title">עזרה בהזמנה</h2>

      {!open ? (
        <p>
          <button type="button" className="account-btn" onClick={() => setOpen(true)}>
            משהו לא בסדר בהזמנה הזו
          </button>
          <span className="account-row__meta"> נפתח פנייה ונדע מיד באיזו הזמנה מדובר.</span>
        </p>
      ) : (
        <form action={action} className="account-form">
          <input type="hidden" name="order_id" value={orderId} />

          <div>
            <label htmlFor={`${baseId}-category`} className="account-label">
              במה מדובר
            </label>
            <select id={`${baseId}-category`} name="category" required className="account-input">
              {CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${baseId}-body`} className="account-label">
              פירוט
            </label>
            <textarea
              id={`${baseId}-body`}
              name="body"
              required
              minLength={10}
              maxLength={4000}
              rows={4}
              className="account-input"
              placeholder="ספרו לנו מה קרה, לפחות 10 תווים"
            />
          </div>

          {state.error && (
            <p role="alert" className="account-note account-note--error">
              {state.error}
            </p>
          )}

          <p>
            <button type="submit" className="account-btn" disabled={pending}>
              {pending ? 'שולח...' : 'פתיחת פנייה'}
            </button>{' '}
            <button type="button" className="account-btn" onClick={() => setOpen(false)}>
              ביטול
            </button>
          </p>
        </form>
      )}
    </section>
  )
}
