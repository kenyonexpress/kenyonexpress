'use client'

import { type SupportState, replyToTicket } from '@/server/actions/support'
import { STATUS_LABELS, type TicketStatus } from '@/server/domain/support/sla'
import Link from 'next/link'
import { useActionState, useId } from 'react'

const EMPTY: SupportState = { ok: false }

/**
 * One conversation, and the reply box under it.
 *
 * THE BOX IS SHOWN ON A CLOSED TICKET TOO. Hiding it forces somebody with one
 * more question to open a second ticket carrying none of the history, which
 * costs the operator the context and the customer the retelling. Replying
 * reopens the ticket, and the copy says so rather than letting it happen
 * silently - `customerMayReply` is where that decision is written down.
 */
export default function TicketThread({
  ticketId,
  status,
  createdAt,
  orderId,
  messages,
}: {
  ticketId: string
  status: TicketStatus
  createdAt: string
  orderId: string | null
  messages: Array<{ id: string; fromUs: boolean; body: string; at: string }>
}) {
  const [state, action, pending] = useActionState(replyToTicket, EMPTY)
  const baseId = useId()

  const finished = status === 'closed' || status === 'resolved'

  return (
    <section className="account-card" dir="rtl">
      <p className="account-subtitle">
        <span className="account-chip">{STATUS_LABELS[status] ?? status}</span>{' '}
        <span className="account-row__meta">
          נפתחה ב-{new Date(createdAt).toLocaleDateString('he-IL')}
        </span>
        {orderId && (
          <>
            {' · '}
            <Link href={`/account/orders/${orderId}`} className="underline">
              ההזמנה הקשורה
            </Link>
          </>
        )}
      </p>

      <ol className="account-list">
        {messages.map((message) => (
          <li key={message.id} className="account-row">
            <div className="account-row__main">
              <span className="account-row__meta">
                {message.fromUs ? 'קניון אקספרס' : 'אתם'} ·{' '}
                {new Date(message.at).toLocaleString('he-IL')}
              </span>
              <p className="whitespace-pre-wrap">{message.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {state.ok && <output className="account-note">{state.message}</output>}

      <form action={action} className="account-form">
        <input type="hidden" name="ticket_id" value={ticketId} />
        <label htmlFor={`${baseId}-body`} className="account-label">
          {finished ? 'עוד משהו? כתיבת תשובה תפתח את הפנייה מחדש' : 'תשובה'}
        </label>
        <textarea
          id={`${baseId}-body`}
          name="body"
          required
          minLength={2}
          maxLength={4000}
          rows={4}
          className="account-input"
        />
        {state.error && (
          <p role="alert" className="account-note account-note--error">
            {state.error}
          </p>
        )}
        <p>
          <button type="submit" className="account-btn" disabled={pending}>
            {pending ? 'שולח...' : 'שליחה'}
          </button>
        </p>
      </form>
    </section>
  )
}
