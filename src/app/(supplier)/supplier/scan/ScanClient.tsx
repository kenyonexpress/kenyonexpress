'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Supplier scan screen. Two explicit steps on purpose: enter/scan a code, then
 * confirm before the single redeem call burns the voucher (a mis-scan is
 * unrecoverable). The balance to collect is shown in the largest type in the
 * result panel, since that is the number the cashier acts on.
 *
 * Redemption is one POST to /api/supplier/vouchers/redeem carrying a fresh
 * idempotency_key, so a double tap on a flaky connection cannot double redeem.
 */

type Stage = 'input' | 'confirm' | 'result'

type VoucherDetail = {
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
  voucher?: VoucherDetail
}

function normalize(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

function formatCode(code: string): string {
  const clean = normalize(code)
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5, 10)}` : clean
}

function formatIls(agorot: number | null): string {
  if (agorot == null) return '—'
  return `₪${(agorot / 100).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// BarcodeDetector is not in the TS DOM lib yet.
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

export default function ScanClient({ supplierName }: { supplierName: string }) {
  const [stage, setStage] = useState<Stage>('input')
  const [rawInput, setRawInput] = useState('')
  const [pendingCode, setPendingCode] = useState('')
  const [pendingQr, setPendingQr] = useState<string | null>(null)
  const [method, setMethod] = useState<'camera' | 'manual'>('manual')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const goConfirm = useCallback(
    (code: string, qr: string | null, scanMethod: 'camera' | 'manual') => {
      setPendingCode(code)
      setPendingQr(qr)
      setMethod(scanMethod)
      setError(null)
      setStage('confirm')
    },
    [],
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
            stopCamera()
            const clean = normalize(value)
            // A KEV1 token stays whole; a bare code is normalized.
            if (value.startsWith('KEV1.')) goConfirm(clean, value, 'camera')
            else goConfirm(clean, null, 'camera')
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
  }, [stopCamera, goConfirm])

  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = normalize(rawInput)
    if (rawInput.startsWith('KEV1.')) {
      goConfirm(normalize(rawInput.split('.')[1] ?? ''), rawInput.trim(), 'manual')
      return
    }
    if (clean.length !== 10) {
      setError('קוד שובר הוא 10 תווים')
      return
    }
    goConfirm(clean, null, 'manual')
  }

  const redeem = async () => {
    setSubmitting(true)
    setError(null)
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    try {
      const res = await fetch('/api/supplier/vouchers/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: pendingQr ? undefined : pendingCode,
          qr_payload: pendingQr ?? undefined,
          method,
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
    setPendingCode('')
    setPendingQr(null)
    setResult(null)
    setError(null)
  }

  if (stage === 'confirm') {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">אשר את הקוד שהוזן</p>
        <p dir="ltr" className="my-3 text-center font-mono text-3xl font-bold tracking-widest">
          {formatCode(pendingCode)}
        </p>
        <p className="mb-4 text-center text-xs text-gray-400">
          המימוש סופי ואינו ניתן לביטול. ודא שהקוד תואם למסך של הלקוח.
        </p>
        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={submitting}
            className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            חזרה
          </button>
          <button
            type="button"
            onClick={() => void redeem()}
            disabled={submitting}
            className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? 'מבצע...' : 'אשר ומַמֵש'}
          </button>
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
                {formatIls(v.remaining_amount_due_agorot)}
              </p>
            </div>
            <dl className="space-y-1.5 rounded-xl bg-white p-4 text-sm">
              <Row label="מוצר" value={v.product_name ?? '—'} />
              <Row label="לקוח" value={v.customer_name ?? '—'} />
              <Row label="שולם באתר" value={formatIls(v.coupon_price_agorot)} />
              <Row label="מחיר מלא" value={formatIls(v.face_value_agorot)} />
            </dl>
          </div>
        )}
        {result.replayed && (
          <p className="mt-3 text-center text-xs text-gray-400">התוצאה שוחזרה מבקשה קודמת</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white"
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
              className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white"
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
          className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white"
        >
          המשך
        </button>
      </form>

      <p className="text-center text-xs text-gray-400">מחובר כ־{supplierName}</p>
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
