'use client'

import { useState } from 'react'

/**
 * The confirm-and-burn step.
 *
 * Redemption is irreversible and the cashier is standing in front of a
 * customer, so the details are shown first and nothing happens until the button
 * is pressed. One POST carries a single idempotency key generated once per
 * mount: a double tap, a flaky counter connection or a browser retry replays
 * the first answer instead of producing a second scan record.
 *
 * The button is disabled while in flight AND after a terminal answer, because
 * the failure this screen must not have is "the cashier pressed it twice and
 * the second press said the voucher was already used".
 */

type VoucherStatus = 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'

type Props = {
  token: string
  code: string
  codeDisplay: string
  status: VoucherStatus
  productName: string | null
  customerName: string | null
  faceValue: string
  paidOnline: string
  toCollect: string
  expiresAtLabel: string
  redeemedAtLabel: string | null
  expired: boolean
}

type Phase = 'ready' | 'working' | 'done'

const STATUS_LABEL: Record<VoucherStatus, string> = {
  issued: 'פעיל',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'הוחזר ללקוח',
}

function newIdempotencyKey(): string {
  return `redeem-${crypto.randomUUID()}`
}

export default function RedeemConfirm(props: Props) {
  const alreadyClosed = props.status !== 'issued' || props.expired
  const [phase, setPhase] = useState<Phase>(alreadyClosed ? 'done' : 'ready')
  const [message, setMessage] = useState<string | null>(
    alreadyClosed
      ? props.status === 'redeemed'
        ? `השובר כבר מומש${props.redeemedAtLabel ? ` ב־${props.redeemedAtLabel}` : ''}`
        : props.expired && props.status === 'issued'
          ? 'תוקף השובר פג'
          : STATUS_LABEL[props.status]
      : null,
  )
  const [succeeded, setSucceeded] = useState(false)
  // One key for the whole life of this screen. Regenerating it per click would
  // turn the replay guard off exactly when it is needed.
  const [idempotencyKey] = useState(newIdempotencyKey)

  async function confirm() {
    setPhase('working')
    try {
      const response = await fetch('/api/supplier/vouchers/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_payload: props.token,
          method: 'camera',
          idempotency_key: idempotencyKey,
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        outcome?: string
        message?: string
      } | null

      setSucceeded(body?.outcome === 'success')
      setMessage(body?.message ?? 'שגיאת מערכת, נסו שוב')
      setPhase('done')
    } catch {
      // A network failure is the one case where retrying is right: the same
      // idempotency key makes a second attempt safe even if the first landed.
      setMessage('אין חיבור לרשת. בדקו את החיבור ונסו שוב')
      setPhase('ready')
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="font-bold text-gray-900">{props.productName ?? 'שובר'}</p>
        {props.customerName && (
          <p className="mt-0.5 text-sm text-gray-500">לקוח: {props.customerName}</p>
        )}
        <p dir="ltr" className="mt-2 font-mono text-2xl font-bold tracking-widest text-gray-900">
          {props.codeDisplay}
        </p>
      </div>

      <div className="px-5 py-4">
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-center">
          <p className="text-xs font-medium text-amber-800">לגבות מהלקוח בקופה</p>
          <p className="mt-0.5 text-3xl font-black text-amber-900">{props.toCollect}</p>
        </div>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">שולם באתר</dt>
            <dd className="font-medium text-gray-900">{props.paidOnline}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">שווי מלא</dt>
            <dd className="text-gray-500">{props.faceValue}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
            <dt className="text-gray-500">בתוקף עד</dt>
            <dd className="font-medium text-gray-900">{props.expiresAtLabel}</dd>
          </div>
        </dl>

        {message && (
          <output
            aria-live="polite"
            className={`mt-4 block rounded-xl px-4 py-3 text-center text-sm font-bold ${
              succeeded ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message}
          </output>
        )}

        {phase !== 'done' && (
          <button
            type="button"
            onClick={confirm}
            disabled={phase === 'working'}
            className="mt-5 w-full rounded-xl bg-gray-900 py-3.5 text-base font-bold text-white transition-opacity disabled:opacity-50"
          >
            {phase === 'working' ? 'מאשר...' : 'אשר מימוש'}
          </button>
        )}

        {phase === 'done' && (
          <a
            href="/supplier/scan"
            className="mt-5 block w-full rounded-xl border border-gray-300 py-3 text-center text-sm font-bold text-gray-700"
          >
            סריקה נוספת
          </a>
        )}
      </div>
    </section>
  )
}
