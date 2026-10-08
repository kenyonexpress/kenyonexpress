'use client'

import { useCart } from '@/components/cart/CartProvider'
import FlashCountdown, { type CountdownPhase } from '@/components/flash/FlashCountdown'
import { STATUS_POLL_MS, flashSalePath, secondsUntil } from '@/lib/flash-sales/rules'
import type { FlashStatus } from '@/lib/flash-sales/status'
import { formatCountdown } from '@/lib/homepage/below-fold-rules'
import { claimFlashSale, leaveFlashSale } from '@/server/actions/flash-sales'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The sale page's working half (STEP 61): the button that takes a unit, the
 * hold with its own clock, and the waiting room.
 *
 * FOUR STATES, ONE SOURCE. `status` starts as what the server rendered and
 * is refreshed from `/api/flash-sales/[id]/status` every `STATUS_POLL_MS`
 * while the tab is visible and the sale is open or the shopper is queued or
 * holding. The poll is what moves a queued shopper to a hold: the route
 * sweeps the sale on the server, so the promotion the database made is seen
 * within one interval without a push channel.
 *
 *   * none      -> "תפסו יחידה" (quantity up to the sale's max per claim)
 *   * held      -> the hold's own countdown and "לקופה", which adds the held
 *                  quantity to the cart (the cart prices it from the hold)
 *                  and goes to the checkout
 *   * queued    -> the waiting room: how many are ahead, "יוצאים מהתור"
 *   * consumed  -> "כבר רכשתם במבצע הזה"
 *
 * A guest sees the sign-in link with a return path, because the claim action
 * requires an account (the checkout does).
 */

type Props = {
  saleId: string
  productId: string
  productName: string
  maxPerClaim: number
  signedIn: boolean
  initialStatus: FlashStatus | null
  startsAt: string
  endsAt: string
}

type Claim = NonNullable<FlashStatus['claim']>

function isLive(claim: Claim | null, nowMs: number): claim is Claim {
  if (!claim || claim.status !== 'held') return false
  if (claim.order_id) return true
  const at = claim.expires_at ? Date.parse(claim.expires_at) : Number.NaN
  return !Number.isNaN(at) && at > nowMs
}

export default function FlashClaimPanel({
  saleId,
  productId,
  productName,
  maxPerClaim,
  signedIn,
  initialStatus,
  startsAt,
  endsAt,
}: Props) {
  const router = useRouter()
  const { addToCart } = useCart()
  const [status, setStatus] = useState<FlashStatus | null>(initialStatus)
  const [phase, setPhase] = useState<CountdownPhase | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [holdLeft, setHoldLeft] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const claim = status?.claim ?? null
  const nowMs = Date.now()
  const held = isLive(claim, nowMs)
  const queued = claim?.status === 'queued'
  const consumed = claim?.status === 'consumed'
  const remaining = status?.remaining ?? null
  const soldOut = remaining !== null && remaining <= 0

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/flash-sales/${encodeURIComponent(saleId)}/status`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!response.ok) return
      const next = (await response.json()) as FlashStatus
      setStatus(next)
    } catch {
      // A failed poll is a stale panel for one interval, nothing more.
    }
  }, [saleId])

  // Poll while there is something that can change under the visitor.
  useEffect(() => {
    const shouldPoll = phase !== 'ended' && (phase === 'live' || queued || held)
    if (!shouldPoll) return
    const start = () => {
      if (pollRef.current) return
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') void refresh()
      }, STATUS_POLL_MS)
    }
    const stop = () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
    start()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [phase, queued, held, refresh])

  // The hold's own clock, one second at a time.
  useEffect(() => {
    if (!held || !claim.expires_at || claim.order_id) {
      setHoldLeft(null)
      return
    }
    const tick = () => {
      const left = secondsUntil(claim.expires_at, new Date())
      setHoldLeft(left)
      if (left === 0) void refresh()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [held, claim, refresh])

  const onClaim = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await claimFlashSale(saleId, quantity)
      setMessage(result.message)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const onLeave = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await leaveFlashSale(saleId)
      setMessage(result.message)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const onCheckout = async () => {
    if (busy || !held) return
    setBusy(true)
    setMessage(null)
    try {
      const accepted = await addToCart(productId, null, claim.quantity, productName)
      if (!accepted) return
      router.push('/checkout')
    } finally {
      setBusy(false)
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(flashSalePath(saleId))}`

  return (
    <div className="flex flex-col gap-4" data-testid="flash-claim-panel" dir="rtl">
      <FlashCountdown startsAt={startsAt} endsAt={endsAt} onPhaseChange={setPhase} />

      {remaining !== null && status && (
        <p className="m-0 text-sm text-muted" data-testid="flash-remaining">
          {soldOut
            ? 'כל היחידות במחיר הבזק תפוסות כרגע.'
            : `נותרו ${remaining} מתוך ${status.allocation} יחידות במחיר הבזק`}
        </p>
      )}

      {consumed && (
        <p className="m-0 rounded-lg bg-surface p-3 text-sm font-semibold text-heading">
          כבר רכשתם במבצע הזה. תודה!
        </p>
      )}

      {held && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4"
          data-testid="flash-hold"
        >
          <p className="m-0 text-base font-bold text-heading">
            {claim.quantity > 1 ? `${claim.quantity} יחידות שמורות לכם` : 'יחידה אחת שמורה לכם'}
          </p>
          {claim.order_id ? (
            <p className="m-0 text-sm text-muted">ההחזקה קשורה להזמנה שבתהליך תשלום.</p>
          ) : (
            <p className="m-0 flex items-center gap-2 text-sm text-heading">
              <span>השלימו את הרכישה בתוך</span>
              <output
                dir="ltr"
                aria-live="off"
                className="rounded bg-brand-secondary px-3 py-1 font-mono text-base font-black tabular-nums tracking-widest text-heading"
              >
                {holdLeft === null ? '--:--:--' : formatCountdown(holdLeft)}
              </output>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCheckout()}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-full bg-brand-primary px-6 text-sm font-bold text-heading transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              לקופה
            </button>
            {!claim.order_id && (
              <button
                type="button"
                onClick={() => void onLeave()}
                disabled={busy}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-6 text-sm font-semibold text-heading disabled:opacity-50"
              >
                משחררים את היחידה
              </button>
            )}
          </div>
        </div>
      )}

      {queued && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4"
          data-testid="flash-waiting-room"
        >
          <p className="m-0 text-base font-bold text-heading">אתם בחדר ההמתנה</p>
          <p className="m-0 text-sm text-heading" aria-live="polite">
            {claim.ahead === null
              ? 'נעדכן כאן ברגע שתתפנה יחידה.'
              : claim.ahead === 0
                ? 'אתם הבאים בתור. ברגע שתתפנה יחידה היא שלכם.'
                : `לפניכם בתור: ${claim.ahead}. ברגע שתתפנה יחידה היא תעבור אליכם.`}
          </p>
          <p className="m-0 text-xs text-muted">השאירו את הדף פתוח; הוא מתעדכן לבד כל כמה שניות.</p>
          <button
            type="button"
            onClick={() => void onLeave()}
            disabled={busy}
            className="inline-flex min-h-11 w-fit items-center rounded-full border border-border px-6 text-sm font-semibold text-heading disabled:opacity-50"
          >
            יוצאים מהתור
          </button>
        </div>
      )}

      {!held && !queued && !consumed && phase === 'live' && (
        <div className="flex flex-col gap-3" data-testid="flash-claim-form">
          {signedIn ? (
            <>
              {maxPerClaim > 1 && (
                <label className="flex items-center gap-2 text-sm text-heading">
                  <span>כמות</span>
                  <select
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="rounded border border-border px-2 py-1"
                    dir="ltr"
                  >
                    {Array.from({ length: maxPerClaim }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => void onClaim()}
                disabled={busy}
                className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-primary px-6 text-sm font-bold text-heading transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {soldOut ? 'להיכנס לחדר ההמתנה' : 'תפסו יחידה במחיר הבזק'}
              </button>
            </>
          ) : (
            <Link
              href={loginHref}
              className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-primary px-6 text-sm font-bold text-heading"
            >
              התחברו כדי לתפוס יחידה
            </Link>
          )}
        </div>
      )}

      {phase === 'upcoming' && !held && !queued && (
        <p className="m-0 text-sm text-muted">הכפתור יופיע כאן ברגע שהמבצע ייפתח.</p>
      )}

      {message && (
        <output className="m-0 block text-sm text-heading" data-testid="flash-message">
          {message}
        </output>
      )}
    </div>
  )
}
