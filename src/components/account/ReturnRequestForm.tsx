'use client'

import { formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/commerce/money'
import {
  RETURN_DESTINATIONS,
  RETURN_DESTINATION_LABELS,
  RETURN_NOTE_MAX,
  RETURN_REASONS,
  RETURN_REASON_CODES,
  RETURN_WINDOW_DAYS,
  type ReturnDestination,
  type ReturnReasonCode,
  previewReturnRefund,
} from '@/lib/returns/policy'
import { submitReturnRequest } from '@/server/actions/returns'
import { useState, useTransition } from 'react'
import type { FormEvent } from 'react'

/**
 * The cancellation control section 1.4 of the refunds architecture requires:
 * on the order, online, recording the notice on press.
 *
 * The preview under the destination radios is `previewReturnRefund`, the same
 * rule the server applies later, so the figure the customer sees before
 * pressing is the figure the admin's approval will produce unless the admin
 * waives the fee. The server re-checks everything: this form cannot grant
 * itself a destination the order is not entitled to.
 */
export interface ReturnRequestFormProps {
  orderId: string
  requestedAgorot: number
  allowedDestinations: readonly ReturnDestination[]
  hasPhysical: boolean
  /** Pre-formatted on the server, or null while a parcel is still on its way. */
  windowEndsLabel: string | null
}

export default function ReturnRequestForm({
  orderId,
  requestedAgorot,
  allowedDestinations,
  hasPhysical,
  windowEndsLabel,
}: ReturnRequestFormProps) {
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode | null>(null)
  const [destination, setDestination] = useState<ReturnDestination>(
    allowedDestinations[0] ?? 'original_method',
  )
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const preview = reasonCode
    ? previewReturnRefund({ requestedAgorot, reasonCode, destination })
    : null

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    if (!reasonCode) {
      setError('בחרו סיבה להחזרה')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitReturnRequest(formData)
      if (result.ok) setDone(result.rma)
      else setError(result.error)
    })
  }

  if (done) {
    return (
      <output className="account-alert account-alert--success">
        <p>
          <strong>הבקשה התקבלה.</strong> מספר הבקשה: <span dir="ltr">{done}</span>. שלחנו אישור
          במייל ונעדכן אותך בכל שלב.
        </p>
        {hasPhysical && <p>אין לשלוח את המוצר לפני שתקבלו מאיתנו הוראות להחזרה.</p>}
        <p>
          <a className="account-btn" href="/account/return">
            למעקב אחרי הבקשה
          </a>
        </p>
      </output>
    )
  }

  return (
    <form className="account-form" onSubmit={onSubmit} data-state="open">
      <input type="hidden" name="orderId" value={orderId} />

      <p className="account-row__meta">
        לפי חוק הגנת הצרכן אפשר לבטל עסקה בתוך {RETURN_WINDOW_DAYS} יום מיום הרכישה או מיום קבלת
        המוצר, המאוחר מביניהם.
        {windowEndsLabel
          ? ` להזמנה הזו: עד ${windowEndsLabel}.`
          : ' המוצר עדיין בדרך, כך שהחלון פתוח.'}
      </p>

      <fieldset className="account-field">
        <legend className="account-field__label">למה מחזירים?</legend>
        {RETURN_REASON_CODES.map((code) => (
          <label className="account-field--check" key={code}>
            <input
              type="radio"
              name="reasonCode"
              value={code}
              checked={reasonCode === code}
              onChange={() => setReasonCode(code)}
              required
            />
            <span>
              {RETURN_REASONS[code].label}
              <span className="account-row__meta"> {RETURN_REASONS[code].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="account-field">
        <legend className="account-field__label">לאן להחזיר את הכסף?</legend>
        {RETURN_DESTINATIONS.map((value) => {
          const allowed = allowedDestinations.includes(value)
          return (
            <label className="account-field--check" key={value}>
              <input
                type="radio"
                name="destination"
                value={value}
                checked={destination === value}
                disabled={!allowed}
                onChange={() => setDestination(value)}
              />
              <span>
                {RETURN_DESTINATION_LABELS[value]}
                {!allowed && value === 'original_method' && (
                  <span className="account-row__meta"> לא זמין: קופון בהזמנה כבר מומש או פג.</span>
                )}
              </span>
            </label>
          )
        })}
      </fieldset>

      {preview && (
        <p className="account-row__meta" data-testid="return-preview">
          {preview.feeAgorot > 0
            ? `החזר צפוי: ${formatIls(preview.refundAgorot)} מתוך ${formatIls(agorot(requestedAgorot))}, אחרי דמי ביטול של ${formatIls(preview.feeAgorot)} (5% או 100 ש"ח, הנמוך מביניהם).`
            : `החזר צפוי: ${formatIls(preview.refundAgorot)}, ללא דמי ביטול.`}
        </p>
      )}

      <label className="account-field">
        <span className="account-field__label">הערות (לא חובה)</span>
        <textarea
          className="account-field__input"
          name="note"
          rows={3}
          maxLength={RETURN_NOTE_MAX}
          placeholder="מה קרה? כל פרט עוזר לנו לטפל מהר יותר."
        />
      </label>

      {error && (
        <p className="account-alert account-alert--error" role="alert">
          {error}
        </p>
      )}

      <div>
        <button type="submit" className="account-btn account-btn--primary" disabled={isPending}>
          {isPending ? 'שולח...' : 'שליחת בקשת החזרה'}
        </button>
      </div>
    </form>
  )
}
