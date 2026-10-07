import { formatDate, formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/commerce/money'
import {
  RETURN_DESTINATION_LABELS,
  RETURN_REASONS,
  RETURN_STATE_LABELS,
  returnTimeline,
} from '@/lib/returns/policy'
import type { ReturnRequest } from '@/server/queries/returns'

/**
 * One return request, as the customer tracks it: the RMA, the four-step
 * timeline, the money, and the statutory deadline. Server-renderable; no
 * state. The chip and the steps read from the same table in policy.ts, so
 * the list page and the order page cannot disagree about a state.
 */
export default function ReturnStatus({
  request,
  compact = false,
}: {
  request: ReturnRequest
  compact?: boolean
}) {
  const state = RETURN_STATE_LABELS[request.state]
  const steps = returnTimeline(request.state)
  const reason = request.reasonCode ? RETURN_REASONS[request.reasonCode].label : null
  const money =
    request.state === 'completed' && request.grantedAgorot !== null
      ? `הוחזרו ${formatIls(agorot(request.grantedAgorot))}`
      : request.cancellationFeeAgorot > 0
        ? `${formatIls(agorot(request.requestedAgorot))} פחות ${formatIls(agorot(request.cancellationFeeAgorot))} דמי ביטול`
        : formatIls(agorot(request.requestedAgorot))

  return (
    <div className="account-return" data-state={request.state}>
      <p className="account-row__title">
        <span dir="ltr">{request.rma}</span>{' '}
        <span className={`account-chip account-chip--${state.tone}`}>{state.label}</span>
      </p>
      <p className="account-row__meta">
        נשלחה ב-{formatDate(request.requestedAt)}
        {reason ? ` · ${reason}` : ''}
        {` · ${RETURN_DESTINATION_LABELS[request.destination]}`}
        {` · ${money}`}
      </p>
      {!compact && (
        <>
          <ol className="account-steps" aria-label="מצב הבקשה">
            {steps.map((step) => (
              <li
                key={step.key}
                className="account-steps__step"
                data-done={step.done ? 'true' : 'false'}
                aria-current={step.current ? 'step' : undefined}
              >
                {step.label}
              </li>
            ))}
          </ol>
          {request.state === 'rejected' ? (
            <p className="account-row__meta">הבקשה לא אושרה. פרטים נשלחו במייל.</p>
          ) : request.state === 'failed' ? (
            <p className="account-row__meta">ההחזר לא הצליח בניסיון הראשון ואנחנו מטפלים בו.</p>
          ) : request.state !== 'completed' ? (
            <p className="account-row__meta">
              על פי חוק, הכסף יוחזר עד {formatDate(request.refundDueBy)}.
            </p>
          ) : request.completedAt ? (
            <p className="account-row__meta">הושלמה ב-{formatDate(request.completedAt)}.</p>
          ) : null}
        </>
      )}
    </div>
  )
}
