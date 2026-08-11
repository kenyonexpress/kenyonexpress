'use client'

import { formatIls } from '@/lib/account/format'
import { cancellationNotice } from '@/lib/commerce/recurring'
import type { Agorot } from '@/lib/money'
import { cancelSubscription } from '@/server/actions/subscriptions'
import type { AccountSubscription } from '@/server/queries/subscriptions'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useState } from 'react'

const STATUS_LABELS: Record<AccountSubscription['status'], string> = {
  active: 'פעיל',
  past_due: 'חיוב נכשל',
  paused: 'מושהה',
  canceled: 'בוטל',
}

const STATUS_CLASSES: Record<AccountSubscription['status'], string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  past_due: 'bg-amber-50 text-amber-800 border-amber-200',
  paused: 'bg-gray-50 text-gray-600 border-gray-200',
  canceled: 'bg-gray-50 text-gray-500 border-gray-200',
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('he-IL')
}

export default function SubscriptionList({
  subscriptions,
}: {
  subscriptions: AccountSubscription[]
}) {
  const [state, action, pending] = useActionState(cancelSubscription, null)
  // Which subscription the confirmation is open for. Cancelling is not
  // reversible from this page - the customer would have to buy again - so it
  // does not happen on a single click.
  const [confirming, setConfirming] = useState<string | null>(null)

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-600">אין לך מנויים פעילים.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-brand hover:underline">
          לדילים באתר
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {state && 'error' in state && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</div>
      )}
      {state && 'success' in state && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          {state.success}
        </div>
      )}

      {subscriptions.map((sub) => (
        <div key={sub.id} className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">
                {sub.productSlug && sub.productName ? (
                  <Link href={`/product/${sub.productSlug}`} className="hover:underline">
                    {sub.productName}
                  </Link>
                ) : (
                  (sub.productName ?? 'מנוי')
                )}
              </p>
              <p className="mt-0.5 text-sm text-gray-600">
                {formatIls(sub.amountAgorot as Agorot)} · {sub.cadence}
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[sub.status]}`}
            >
              {STATUS_LABELS[sub.status]}
            </span>
          </div>

          {sub.needsAttention && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                החיוב האחרון נכשל שלוש פעמים ולא ינוסה שוב. יש לעדכן את אמצעי התשלום ב
                <Link href="/account/tokens" className="underline">
                  אמצעי תשלום
                </Link>
                , או לבטל את המנוי.
              </span>
            </p>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-3">
            <div>
              <dt className="text-gray-500">החיוב הבא</dt>
              <dd className="font-medium text-gray-900">
                {sub.status === 'canceled' ? 'אין' : formatDate(sub.nextChargeAt)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">החיוב האחרון</dt>
              <dd className="font-medium text-gray-900">{formatDate(sub.lastChargeAt)}</dd>
            </div>
            {sub.canceledAt && (
              <div>
                <dt className="text-gray-500">בוטל בתאריך</dt>
                <dd className="font-medium text-gray-900">{formatDate(sub.canceledAt)}</dd>
              </div>
            )}
          </dl>

          {sub.status !== 'canceled' &&
            (confirming === sub.id ? (
              <form action={action} className="mt-4 rounded-lg bg-gray-50 p-3">
                <input type="hidden" name="id" value={sub.id} />
                <p className="text-xs text-gray-700">{cancellationNotice(sub.nextChargeAt)}</p>
                <label htmlFor={`reason-${sub.id}`} className="mt-2 block text-xs text-gray-500">
                  למה ביטלת? (לא חובה)
                </label>
                <input
                  id={`reason-${sub.id}`}
                  name="reason"
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    {pending ? 'מבטל...' : 'אישור ביטול'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    השאר את המנוי
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(sub.id)}
                className="mt-4 text-xs text-gray-500 hover:text-red-600 hover:underline"
              >
                ביטול המנוי
              </button>
            ))}
        </div>
      ))}
    </div>
  )
}
