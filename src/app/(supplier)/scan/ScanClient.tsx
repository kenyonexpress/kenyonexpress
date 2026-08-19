'use client'

import { formatAgorot, formatCouponCode, formatCouponDate } from '@/lib/vouchers/coupon-view'
import { parseScanInput } from '@/lib/vouchers/scan-input'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The counter's screen. Three steps, and the middle one is the point:
 *
 *   input   -> scan a QR or type the code
 *   confirm -> the platform says what this voucher IS, before anything is spent
 *   result  -> redeemed, with the balance to collect in the largest type
 *
 * The confirm step used to show nothing but the digits the cashier had just
 * typed. That made the first word the platform said about a voucher arrive
 * AFTER redeem_voucher() had burned it, and a redemption cannot be undone. It
 * now calls /api/supplier/vouchers/lookup, which reads and writes nothing, so
 * a wrong code, a spent voucher or a lapsed one is caught while it still costs
 * nothing to be wrong.
 *
 * Redemption itself is one POST to /api/supplier/vouchers/redeem carrying a
 * fresh idempotency_key, so a double tap on a flaky till connection cannot
 * redeem twice.
 */

type Stage = 'input' | 'confirm' | 'result'

type LookupVoucher = {
  code: string
  status: string
  product_name: string | null
  customer_name: string | null
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  expires_at: string
  redeemed_at: string | null
}

type LookupResponse = {
  outcome: string
  message: string
  voucher?: LookupVoucher
}

type RedeemVoucher = {
  code: string | null
  product_name: string | null
  customer_name: string | null
  face_value_agorot: number | null
  coupon_price_agorot: number | null
  remaining_amount_due_agorot: number | null
  redeemed_at: string | null
}

type RedeemResponse = {
  outcome: string
  message: string
  replayed?: boolean
  voucher?: RedeemVoucher
}

// BarcodeDetector is not in the TS DOM lib yet.
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

export default function ScanClient({ supplierName }: { supplierName: string }) {
  const [stage, setStage] = useState<Stage>('input')
  const [rawInput, setRawInput] = useState('')
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [method, setMethod] = useState<'camera' | 'manual'>('manual')
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookup, setLookup] = useState<LookupResponse | null>(null)
  const [result, setResult] = useState<RedeemResponse | null>(null)

  const [cameraOn, setCameraOn] = useState(false)
  const cameraSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    setCameraOn(false)
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  /** Verify against the platform, then move to confirm. Nothing is spent here. */
  const verify = useCallback(
    async (code: string | null, token: string | null, scanMethod: 'camera' | 'manual') => {
      setPendingCode(code)
      setPendingToken(token)
      setMethod(scanMethod)
      setError(null)
      setChecking(true)
      try {
        const res = await fetch('/api/supplier/vouchers/lookup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: token ? undefined : code,
            qr_payload: token ?? undefined,
            method: scanMethod,
          }),
        })
        const body = (await res.json()) as LookupResponse
        setLookup(body)
        setStage('confirm')
      } catch {
        setError('שגיאת רשת, נסה שוב')
      } finally {
        setChecking(false)
      }
    },
    [],
  )

  const handleScanned = useCallback(
    (raw: string, scanMethod: 'camera' | 'manual') => {
      const parsed = parseScanInput(raw)
      if (parsed.kind === 'invalid') {
        setError('הקוד אינו תקין. קוד שובר הוא 10 תווים, או סרקו את ה-QR של הלקוח.')
        return
      }
      void verify(parsed.code, parsed.token, scanMethod)
    },
    [verify],
  )

  const startCamera = useCallback(async () => {
    setError(null)
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector
    if (!Detector) {
      setError('הדפדפן אינו תומך בסריקת מצלמה, הקלד ידנית')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      setCameraOn(true)
      const detector = new Detector({ formats: ['qr_code'] })
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()

      const tick = async () => {
        if (!streamRef.current) return
        try {
          const codes = await detector.detect(video)
          const value = codes[0]?.rawValue
          if (value) {
            // parseScanInput takes the QR whole: a redeem URL, a bare KEV1
            // token and a typed code all arrive here.
            stopCamera()
            handleScanned(value, 'camera')
            return
          }
        } catch {
          // transient decode error; keep scanning
        }
        rafRef.current = requestAnimationFrame(() => void tick())
      }
      rafRef.current = requestAnimationFrame(() => void tick())
    } catch {
      setError('לא ניתן לגשת למצלמה')
      stopCamera()
    }
  }, [stopCamera, handleScanned])

  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleScanned(rawInput, 'manual')
  }

  const redeem = async () => {
    setSubmitting(true)
    setError(null)
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    try {
      const res = await fetch('/api/supplier/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: pendingToken ? undefined : pendingCode,
          qr_payload: pendingToken ?? undefined,
          method,
          scan_method: method,
          idempotency_key: idempotencyKey,
        }),
      })
      const body = (await res.json()) as RedeemResponse
      setResult(body)
      setStage('result')
    } catch {
      setError('שגיאת רשת, נסה שוב')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setStage('input')
    setRawInput('')
    setPendingCode(null)
    setPendingToken(null)
    setLookup(null)
    setResult(null)
    setError(null)
  }

  if (stage === 'confirm' && lookup) {
    const v = lookup.voucher
    const redeemable = lookup.outcome === 'redeemable'
    return (
      <div
        className={`rounded-2xl border p-5 shadow-sm ${
          redeemable ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'
        }`}
      >
        <p className="text-center text-sm text-gray-500">{lookup.message}</p>
        <p dir="ltr" className="my-3 text-center font-mono text-3xl font-bold tracking-widest">
          {formatCouponCode(v?.code ?? pendingCode ?? '')}
        </p>

        {v ? (
          <>
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-sm text-gray-500">
                {redeemable ? 'לגבייה מהלקוח אחרי אישור' : 'יתרת השובר'}
              </p>
              <p className="mt-1 text-4xl font-extrabold text-gray-900">
                {formatAgorot(v.remaining_amount_due_agorot)}
              </p>
            </div>
            <dl className="mt-3 space-y-1.5 rounded-xl bg-gray-50 p-4 text-sm">
              <Row label="מוצר" value={v.product_name ?? '—'} />
              <Row label="לקוח" value={v.customer_name ?? '—'} />
              <Row label="שולם באתר" value={formatAgorot(v.coupon_price_agorot)} />
              <Row label="מחיר מלא" value={formatAgorot(v.face_value_agorot)} />
              <Row
                label={v.redeemed_at ? 'מומש ב' : 'בתוקף עד'}
                value={formatCouponDate(v.redeemed_at ?? v.expires_at)}
              />
            </dl>
          </>
        ) : lookup.outcome === 'unavailable' ? (
          // Not the hint below: that one blames the code, and this outcome
          // means the platform never managed to look the code up at all.
          <p className="text-center text-sm text-gray-500">
            לא בוצע שום שינוי בשובר. נסו לסרוק שוב בעוד רגע.
          </p>
        ) : (
          <p className="text-center text-sm text-gray-500">
            ודאו שהקוד תואם למסך של הלקוח, או בקשו ממנו לפתוח מחדש את הקופון באזור האישי.
          </p>
        )}

        {redeemable && (
          <p className="mt-4 text-center text-xs text-gray-400">
            המימוש סופי ואינו ניתן לביטול. השובר יפוג מיד עם האישור.
          </p>
        )}
        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={submitting}
            className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            {redeemable ? 'חזרה' : 'סריקה נוספת'}
          </button>
          {redeemable && (
            <button
              type="button"
              onClick={() => void redeem()}
              disabled={submitting}
              className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? 'מבצע...' : 'אשר ומַמֵש'}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (stage === 'result' && result) {
    const ok = result.outcome === 'success'
    const v = result.voucher
    return (
      <div
        className={`rounded-2xl border p-5 shadow-sm ${
          ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
        }`}
      >
        <p className={`text-center text-lg font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>
          {result.message}
        </p>
        {ok && v && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-white p-4 text-center">
              <p className="text-sm text-gray-500">לגבייה מהלקוח עכשיו</p>
              <p className="mt-1 text-4xl font-extrabold text-gray-900">
                {formatAgorot(v.remaining_amount_due_agorot)}
              </p>
            </div>
            <dl className="space-y-1.5 rounded-xl bg-white p-4 text-sm">
              <Row label="מוצר" value={v.product_name ?? '—'} />
              <Row label="לקוח" value={v.customer_name ?? '—'} />
              <Row label="שולם באתר" value={formatAgorot(v.coupon_price_agorot)} />
              <Row label="מחיר מלא" value={formatAgorot(v.face_value_agorot)} />
            </dl>
          </div>
        )}
        {result.replayed && (
          <p className="mt-3 text-center text-xs text-gray-400">התוצאה שוחזרה מבקשה קודמת</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 w-full rounded-xl bg-heading py-3 text-sm font-bold text-white"
        >
          סריקה נוספת
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cameraSupported && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          {cameraOn ? (
            <div className="space-y-3">
              {/* biome-ignore lint/a11y/useMediaCaption: live camera preview */}
              <video ref={videoRef} className="w-full rounded-xl bg-black" playsInline />
              <button
                type="button"
                onClick={stopCamera}
                className="w-full rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700"
              >
                עצור מצלמה
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={checking}
              className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              סרוק QR במצלמה
            </button>
          )}
        </div>
      )}

      <form
        onSubmit={onManualSubmit}
        className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <label htmlFor="voucher-code" className="block text-sm font-medium text-gray-700">
          הקלדת קוד ידנית
        </label>
        <input
          id="voucher-code"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="XXXXX-XXXXX"
          dir="ltr"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center font-mono text-lg tracking-widest text-gray-900 placeholder:text-gray-300 focus:border-gray-900 focus:outline-none"
        />
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={checking}
          className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {checking ? 'בודק...' : 'בדוק שובר'}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400">מחובר כ-{supplierName}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  )
}
