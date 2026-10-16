'use client'

import { useState } from 'react'

/**
 * XD14: Supplier redemption UX redesign with 2-tap confirmation.
 *
 * Redemption is irreversible and the cashier is standing in front of a
 * customer, so a large status badge and 2-tap confirmation prevent accidents.
 * First tap arms the button, second tap commits. On success, show "הקופון הבא"
 * button to return to QR scanner. Idempotent: second scan shows timestamp.
 */

type VoucherStatus = 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'

type Props = {
  token: string
  code: string
  codeDisplay: string
  status: VoucherStatus
  productName: string | null
  faceValue: string
  paidOnline: string
  toCollect: string
  expiresAtLabel: string
  redeemedAtISO: string | null
  expired: boolean
}

type Phase = 'ready' | 'armed' | 'working' | 'done'

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

function formatRedemptionTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function RedeemConfirm(props: Props) {
  const alreadyClosed = props.status !== 'issued' || props.expired
  const [phase, setPhase] = useState<Phase>(alreadyClosed ? 'done' : 'ready')
  const [message, setMessage] = useState<string | null>(
    alreadyClosed
      ? props.status === 'redeemed'
        ? `כבר מומש${props.redeemedAtISO ? ` ${formatRedemptionTime(props.redeemedAtISO)}` : ''}`
        : props.expired && props.status === 'issued'
          ? 'תוקף השובר פג'
          : STATUS_LABEL[props.status]
      : null,
  )
  const [succeeded, setSucceeded] = useState(false)
  const [idempotencyKey] = useState(newIdempotencyKey)

  const isValid = props.status === 'issued' && !props.expired
  const statusBadge = isValid ? 'קופון תקף' : 'קופון לא תקף'
  const statusColor = isValid ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'

  async function confirm() {
    if (phase === 'ready') {
      // First tap: arm the button
      setPhase('armed')
      return
    }

    if (phase === 'armed') {
      // Second tap: commit
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
          redeemed_at?: string
        } | null

        setSucceeded(body?.outcome === 'success')
        // On already_redeemed, show timestamp if available
        if (body?.outcome === 'already_redeemed' && body?.redeemed_at) {
          setMessage(`כבר מומש ${formatRedemptionTime(body.redeemed_at)}`)
        } else {
          setMessage(body?.message ?? 'שגיאת מערכת, נסו שוב')
        }
        setPhase('done')
      } catch {
        // Network failure: reset to allow retry with same idempotency key
        setMessage('אין חיבור לרשת. בדקו את החיבור ונסו שוב')
        setPhase('armed')
      }
    }
  }

  // Success screen with "הקופון הבא" button (mobile-only)
  if (phase === 'done' && succeeded) {
    return (
      <section className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-gradient-to-b from-green-50 to-white p-6 text-center md:hidden">
        <div className="text-6xl" aria-hidden="true">
          ✓
        </div>
        <div>
          <p className="text-lg font-bold text-green-900">{message}</p>
        </div>
        <a
          href="/scan"
          className="w-full rounded-xl bg-brand py-3.5 text-base font-bold text-gray-900 transition-all active:scale-95"
        >
          הקופון הבא
        </a>
      </section>
    )
  }

  // Failure or already-redeemed screen (mobile-only)
  if (phase === 'done' && !succeeded) {
    return (
      <section className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-gradient-to-b from-red-50 to-white p-6 text-center md:hidden">
        <div className="text-5xl" aria-hidden="true">
          ⚠️
        </div>
        <div>
          <p className="text-lg font-bold text-red-900">{message}</p>
        </div>
        <a
          href="/scan"
          className="w-full rounded-xl bg-gray-900 py-3.5 text-base font-bold text-white transition-all active:scale-95"
        >
          הקופון הבא
        </a>
      </section>
    )
  }

  // Main redemption screen with 2-tap confirm (mobile-only)
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 md:hidden">
      {/* Large status badge */}
      <div className={`rounded-xl px-4 py-3 text-center ${statusColor}`}>
        <p className="text-sm font-bold">{statusBadge}</p>
      </div>

      {/* Large voucher value */}
      <div className="text-center">
        <p className="text-5xl font-black text-gray-900">{props.toCollect}</p>
        <p className="mt-1 text-xs font-medium text-gray-500">לגבות מהלקוח בקופה</p>
      </div>

      {/* Product and code details (no customer PII) */}
      <div className="rounded-xl bg-gray-50 p-4 text-center">
        <p className="font-bold text-gray-900">{props.productName ?? 'שובר'}</p>
        <p dir="ltr" className="mt-2 font-mono text-lg font-bold tracking-widest text-gray-700">
          {props.codeDisplay}
        </p>
      </div>

      {/* Expiry info */}
      <dl className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">בתוקף עד</dt>
          <dd className="font-medium text-gray-900">{props.expiresAtLabel}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">שולם באתר</dt>
          <dd className="font-medium text-gray-900">{props.paidOnline}</dd>
        </div>
      </dl>

      {/* 2-tap confirm button */}
      <button
        type="button"
        onClick={confirm}
        disabled={!isValid}
        className="mt-4 w-full rounded-xl bg-brand py-3.5 text-base font-bold text-gray-900 transition-all disabled:opacity-50 active:scale-95"
      >
        {phase === 'ready' && 'אשר מימוש'}
        {phase === 'armed' && 'הקש שוב לאישור'}
        {phase === 'working' && 'מאשר...'}
      </button>
    </section>
  )
}
