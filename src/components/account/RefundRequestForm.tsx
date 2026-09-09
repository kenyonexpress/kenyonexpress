'use client'

import { type RefundRequestState, requestRefund } from '@/server/actions/refund-requests'
import { useActionState, useId, useState } from 'react'

const EMPTY: RefundRequestState = { ok: false }

/**
 * The customer's refund request form, and the cap made visible.
 *
 * THE COUNT IS SHOWN BEFORE THE FORM IS OPENED, not after a submission is
 * refused. A limit somebody discovers by hitting it reads as a malfunction;
 * "בקשה 2 מתוך 3" read beforehand is a rule. The number comes from the server,
 * which counts the same rows the database trigger counts.
 *
 * COLLAPSED BY DEFAULT. This sits on the page of an order that is, in the
 * overwhelming majority of cases, fine. An always-open refund form on every
 * order page is an invitation rather than a remedy.
 */

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'not_received', label: 'לא קיבלתי את ההזמנה' },
  { value: 'not_as_described', label: 'המוצר אינו כפי שתואר' },
  { value: 'defective', label: 'המוצר פגום' },
  { value: 'duplicate_charge', label: 'חויבתי פעמיים' },
  { value: 'changed_mind', label: 'ביטול והתחרטות' },
  { value: 'other', label: 'סיבה אחרת' },
]

const STATUS_LABEL: Record<string, string> = {
  pending: 'ממתינה לבדיקה',
  approved: 'אושרה',
  rejected: 'נדחתה',
  withdrawn: 'בוטלה על ידיכם',
}

type Props = {
  orderId: string
  allowed: boolean
  blockedMessage: string | null
  remaining: number
  requests: Array<{ status: string; created_at: string; reason_code: string }>
}

export default function RefundRequestForm({
  orderId,
  allowed,
  blockedMessage,
  remaining,
  requests,
}: Props) {
  const [state, action, pending] = useActionState(requestRefund, EMPTY)
  const [open, setOpen] = useState(false)
  const baseId = useId()

  // After a successful submission the server's `remaining` is authoritative;
  // before one, the value the page was rendered with is.
  const left = state.ok && typeof state.remaining === 'number' ? state.remaining : remaining

  return (
    <section className="account-card" dir="rtl">
      <h2 className="account-card__title">בקשת החזר</h2>

      {requests.length > 0 && (
        <ul className="account-list">
          {requests.map((request) => (
            <li key={`${request.created_at}-${request.reason_code}`} className="account-row">
              <div className="account-row__main">
                <span>{REASONS.find((r) => r.value === request.reason_code)?.label ?? 'בקשה'}</span>
                <span className="account-row__meta">
                  {new Date(request.created_at).toLocaleDateString('he-IL')}
                </span>
              </div>
              <div className="account-row__actions">
                {STATUS_LABEL[request.status] ?? request.status}
              </div>
            </li>
          ))}
        </ul>
      )}

      {state.ok ? <output className="account-note">{state.message}</output> : null}

      {!allowed && blockedMessage ? (
        <p className="account-note">{blockedMessage}</p>
      ) : allowed && !open ? (
        <p>
          <button type="button" className="account-btn" onClick={() => setOpen(true)}>
            בקשת החזר על ההזמנה
          </button>
          <span className="account-row__meta">
            {' '}
            נותרו <bdi>{left}</bdi> בקשות מתוך <bdi>3</bdi>
          </span>
        </p>
      ) : allowed && open ? (
        <form action={action} className="account-form">
          <input type="hidden" name="order_id" value={orderId} />

          <div>
            <label htmlFor={`${baseId}-reason`} className="account-label">
              הסיבה
            </label>
            <select id={`${baseId}-reason`} name="reason_code" required className="account-input">
              {REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${baseId}-text`} className="account-label">
              פירוט
            </label>
            <textarea
              id={`${baseId}-text`}
              name="reason_text"
              required
              minLength={10}
              maxLength={2000}
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
              {pending ? 'שולח...' : 'שליחת הבקשה'}
            </button>{' '}
            <button type="button" className="account-btn" onClick={() => setOpen(false)}>
              ביטול
            </button>
          </p>
        </form>
      ) : null}
    </section>
  )
}
