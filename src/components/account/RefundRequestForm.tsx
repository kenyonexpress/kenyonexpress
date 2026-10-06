'use client'

import { formatIls } from '@/lib/account/format'
import { formatDateShort } from '@/lib/i18n/format'
import { t } from '@/lib/i18n/messages'
import { agorot } from '@/lib/money'
import { type RefundRequestState, requestRefund } from '@/server/actions/refund-requests'
import Link from 'next/link'
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

/**
 * THE HUNDRED-PERCENT RULE, SHOWN NEXT TO THE REASON THAT TRIGGERS IT.
 *
 * `computeCancellationFee` returns ZERO when the claim is a defect or a
 * non-conformity, and the lower of 5% or ₪100 otherwise. That is the Consumer
 * Protection Law's distance-selling fee, and it is already implemented - what
 * has never existed is the customer being TOLD which of the two they are in
 * before they choose.
 *
 * It matters in both directions. Somebody whose item arrived broken and who
 * picks "ביטול והתחרטות" out of politeness has just agreed to a fee the law
 * does not make them pay. Somebody who genuinely changed their mind should see
 * the fee before submitting rather than in the refund notification.
 *
 * `fullRefund` is therefore not a label, it is the same rule stated where the
 * decision is made. If the statute moves, `computeCancellationFee` and this
 * array move together, and the test beside the domain file is what keeps them
 * honest about it.
 */
const REASONS: Array<{ value: string; label: string; fullRefund: boolean }> = [
  { value: 'not_received', label: 'לא קיבלתי את ההזמנה', fullRefund: true },
  { value: 'not_as_described', label: 'המוצר אינו כפי שתואר', fullRefund: true },
  { value: 'defective', label: 'המוצר פגום', fullRefund: true },
  { value: 'duplicate_charge', label: 'חויבתי פעמיים', fullRefund: true },
  { value: 'changed_mind', label: 'ביטול והתחרטות', fullRefund: false },
  { value: 'other', label: 'סיבה אחרת', fullRefund: false },
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
  /** What was paid on site for this order, integer agorot. */
  chargedAgorot: number
  /**
   * The statutory fee for a voluntary cancellation of THIS order, integer
   * agorot, computed on the server by `computeCancellationFee` and passed down
   * so the sentence beside the reason carries the number and not only the rule.
   */
  feeAgorot: number
}

export default function RefundRequestForm({
  orderId,
  allowed,
  blockedMessage,
  remaining,
  requests,
  chargedAgorot,
  feeAgorot,
}: Props) {
  const [state, action, pending] = useActionState(requestRefund, EMPTY)
  const [open, setOpen] = useState(false)
  const [reasonCode, setReasonCode] = useState(REASONS[0]?.value ?? 'other')
  const baseId = useId()

  const fullRefund = REASONS.find((r) => r.value === reasonCode)?.fullRefund ?? false

  // After a successful submission the server's `remaining` is authoritative;
  // before one, the value the page was rendered with is.
  const left = state.ok && typeof state.remaining === 'number' ? state.remaining : remaining

  return (
    <section className="account-card" dir="rtl" data-testid="cancellation-request">
      <h2 className="account-card__title">{t('cancellation.title')}</h2>
      {/*
        Consumer Protection Law s.14C, named on the page where the right is
        exercised and not only in the policy: the form below IS the cancellation
        request, and a customer looking for "ביטול" must not have to guess that
        "החזר" is the word for it here.
      */}
      <p className="account-row__meta">
        {t('cancellation.law')} <Link href="/refund_returns">{t('cancellation.policyLink')}</Link>
      </p>

      {requests.length > 0 && (
        <ul className="account-list">
          {requests.map((request) => (
            <li key={`${request.created_at}-${request.reason_code}`} className="account-row">
              <div className="account-row__main">
                <span>{REASONS.find((r) => r.value === request.reason_code)?.label ?? 'בקשה'}</span>
                <span className="account-row__meta">{formatDateShort(request.created_at)}</span>
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
            {t('cancellation.openCta')}
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
            <select
              id={`${baseId}-reason`}
              name="reason_code"
              required
              className="account-input"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              {REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
            {/*
              THE FEE IN AGOROT, FOR THIS ORDER, BEFORE THE SUBMIT. The sentence
              used to state the rule ("the lower of 5% or ₪100") and leave the
              arithmetic to the customer. Both numbers are integers computed on
              the server through `applyBp`; the component only formats them.
              The data attributes carry the raw agorot so a test can check the
              arithmetic without parsing a shekel string.
            */}
            <dl
              className="account-note"
              data-testid="cancellation-fee-preview"
              data-fee-agorot={fullRefund ? 0 : feeAgorot}
              data-refund-agorot={fullRefund ? chargedAgorot : chargedAgorot - feeAgorot}
            >
              <div className="flex justify-between gap-3">
                <dt>{t('cancellation.paidLabel')}</dt>
                <dd>{formatIls(agorot(chargedAgorot))}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t('cancellation.feeLabel')}</dt>
                <dd>{formatIls(agorot(fullRefund ? 0 : feeAgorot))}</dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold">
                <dt>{t('cancellation.refundLabel')}</dt>
                <dd>{formatIls(agorot(fullRefund ? chargedAgorot : chargedAgorot - feeAgorot))}</dd>
              </div>
            </dl>
            <p className="account-note">
              {fullRefund ? t('cancellation.fullRefundRule') : t('cancellation.feeRule')}
            </p>
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
