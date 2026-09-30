'use client'

import { formatAgorot, formatCouponCode, formatCouponDate } from '@/lib/vouchers/coupon-view'
import {
  type DrainResult,
  type QueuedScan,
  type ScanMethod,
  type SubmitResult,
  drainQueue,
  readQueue,
  submitScan,
} from '@/lib/vouchers/merchant-scan-queue'
import { type QrDecoder, createQrDecoder } from '@/lib/vouchers/qr-decoder'
import { parseScanInput } from '@/lib/vouchers/scan-input'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The till that works without a signal.
 *
 * Same three stages as /scan - input, confirm, result - and one more state
 * that runs across all of them: the QUEUE. Every scan is submitted online
 * first; when the request never comes back, the scan is stored on the device
 * under the key it was sent with, the cashier is told it is WAITING, and a
 * drain runs the moment the browser reports a connection again. The rules
 * that make that safe are in lib/vouchers/merchant-scan-queue.ts; this file
 * decides when to sync and what to show.
 *
 * OFFLINE CONFIRMATION IS HONEST ABOUT WHAT IT DOES NOT KNOW. Online, the
 * confirm step calls the lookup route and shows the voucher's product, balance
 * and status before anything is spent. Offline there is nothing to ask, so the
 * screen shows the code that was read and says in so many words that the
 * platform has not checked it: the cashier is choosing to serve on trust and
 * find out at sync time. A green tick is never shown for a queued scan.
 *
 * CAMERA. BarcodeDetector where the browser has it, jsQR (loaded on demand)
 * where it does not. The viewfinder is the rear camera and the loop stops the
 * moment a code is read, so one QR in front of the lens is one scan.
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

type PendingScan = {
  code: string | null
  token: string | null
  method: ScanMethod
  label: string
}

const DRAIN_MESSAGES: Record<Exclude<DrainResult['kind'], 'drained' | 'empty'>, string> = {
  offline: 'עדיין אין חיבור, הסריקות ממתינות',
  unauthorized: 'ההתחברות פגה. התחברו מחדש ואז סנכרנו',
  rate_limited: 'יותר מדי סנכרונים, נסו שוב בעוד דקה',
  failed: 'הסנכרון נכשל, ננסה שוב בהמשך',
}

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

export default function MerchantScanClient({ supplierName }: { supplierName: string }) {
  const [stage, setStage] = useState<Stage>('input')
  const [rawInput, setRawInput] = useState('')
  const [pending, setPending] = useState<PendingScan | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookup, setLookup] = useState<LookupResponse | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)

  const [online, setOnline] = useState<boolean>(readOnline)
  const [queue, setQueue] = useState<QueuedScan[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastDrain, setLastDrain] = useState<DrainResult | null>(null)
  const drainingRef = useRef(false)

  const [cameraOn, setCameraOn] = useState(false)
  const [cameraSupported, setCameraSupported] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const decoderRef = useRef<QrDecoder | null>(null)

  const deps = useCallback(
    () => ({
      store: window.localStorage,
      fetch: (url: string, init: RequestInit) => fetch(url, init),
    }),
    [],
  )

  const refreshQueue = useCallback(() => {
    setQueue(readQueue(window.localStorage))
  }, [])

  /** Drains what is waiting. Re-entrant calls are dropped, not queued. */
  const sync = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    setSyncing(true)
    try {
      const outcome = await drainQueue(deps())
      setLastDrain(outcome)
      refreshQueue()
    } finally {
      drainingRef.current = false
      setSyncing(false)
    }
  }, [deps, refreshQueue])

  useEffect(() => {
    setCameraSupported(
      typeof navigator !== 'undefined' &&
        typeof navigator.mediaDevices?.getUserMedia === 'function',
    )
    refreshQueue()
    if (readOnline()) void sync()

    const goOnline = () => {
      setOnline(true)
      void sync()
    }
    const goOffline = () => setOnline(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && readOnline()) void sync()
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshQueue, sync])

  const stopCamera = useCallback(() => {
    if (timerRef.current != null) clearTimeout(timerRef.current)
    timerRef.current = null
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    setCameraOn(false)
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  /** Online: ask the platform what this is. Offline: show what was read and say it is unchecked. */
  const verify = useCallback(async (next: PendingScan) => {
    setPending(next)
    setError(null)
    setLookup(null)
    if (!readOnline()) {
      setStage('confirm')
      return
    }
    setChecking(true)
    try {
      const res = await fetch('/api/supplier/vouchers/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: next.token ? undefined : next.code,
          qr_payload: next.token ?? undefined,
          method: next.method,
        }),
      })
      setLookup((await res.json()) as LookupResponse)
    } catch {
      // The connection dropped between the scan and the lookup. Treat it as
      // the offline case rather than an error: the scan is still good.
      setOnline(false)
    } finally {
      setChecking(false)
      setStage('confirm')
    }
  }, [])

  const handleScanned = useCallback(
    (raw: string, method: ScanMethod) => {
      const parsed = parseScanInput(raw)
      if (parsed.kind === 'invalid') {
        setError('הקוד אינו תקין. קוד שובר הוא 10 תווים או 8 ספרות, או סרקו את ה-QR של הלקוח.')
        return
      }
      void verify({
        code: parsed.code,
        token: parsed.token,
        method,
        label: parsed.code ? formatCouponCode(parsed.code) : 'QR',
      })
    },
    [verify],
  )

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const decoder =
        decoderRef.current ??
        (await createQrDecoder(window as unknown as Parameters<typeof createQrDecoder>[0]))
      decoderRef.current = decoder
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()

      const canvas = canvasRef.current ?? document.createElement('canvas')
      canvasRef.current = canvas
      // The native detector is cheap enough to run every frame or so; jsQR is
      // main-thread work and is given room to breathe between attempts.
      const interval = decoder.kind === 'native' ? 120 : 220
      const tick = async () => {
        if (!streamRef.current) return
        let text: string | null = null
        try {
          text = await decoder.decode(video, canvas)
        } catch {
          text = null
        }
        if (text) {
          stopCamera()
          handleScanned(text, 'camera')
          return
        }
        timerRef.current = setTimeout(() => void tick(), interval)
      }
      timerRef.current = setTimeout(() => void tick(), interval)
    } catch {
      stopCamera()
      setError('אין גישה למצלמה. אפשרו מצלמה לאתר, או הקלידו את הקוד ידנית.')
    }
  }, [handleScanned, stopCamera])

  const redeem = useCallback(async () => {
    if (!pending) return
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await submitScan(deps(), {
        code: pending.token ? undefined : (pending.code ?? undefined),
        qrPayload: pending.token ?? undefined,
        scanMethod: pending.method,
        label: pending.label,
      })
      setResult(outcome)
      setStage('result')
      refreshQueue()
    } finally {
      setSubmitting(false)
    }
  }, [deps, pending, refreshQueue])

  const reset = useCallback(() => {
    setStage('input')
    setRawInput('')
    setPending(null)
    setLookup(null)
    setResult(null)
    setError(null)
  }, [])

  const onManualSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    handleScanned(rawInput, 'manual')
  }

  const queuePanel = (
    <QueuePanel
      online={online}
      queue={queue}
      syncing={syncing}
      lastDrain={lastDrain}
      onSync={() => void sync()}
    />
  )

  if (stage === 'confirm' && pending) {
    const v = lookup?.voucher
    const checked = Boolean(lookup)
    const redeemable = checked ? lookup?.outcome === 'success' : true
    return (
      <div className="space-y-4">
        {queuePanel}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-center text-sm text-gray-500">
            {checked ? 'פרטי השובר' : 'שובר שנקרא בלי חיבור'}
          </p>
          <p className="mt-1 text-center font-mono text-2xl font-bold tracking-widest" dir="ltr">
            {pending.label}
          </p>

          {checked && v && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-sm text-gray-500">לגבייה מהלקוח</p>
                <p className="mt-1 text-4xl font-extrabold text-gray-900">
                  {formatAgorot(v.remaining_amount_due_agorot)}
                </p>
              </div>
              <dl className="space-y-1.5 text-sm">
                <Row label="מוצר" value={v.product_name ?? '—'} />
                <Row label="לקוח" value={v.customer_name ?? '—'} />
                <Row label="שולם באתר" value={formatAgorot(v.coupon_price_agorot)} />
                <Row label="בתוקף עד" value={formatCouponDate(v.expires_at)} />
              </dl>
            </div>
          )}

          {checked && !redeemable && (
            <p className="mt-4 text-center text-base font-bold text-red-700">{lookup?.message}</p>
          )}

          {!checked && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-800">
              אין חיבור, ולכן הפלטפורמה עדיין לא בדקה את השובר. אישור עכשיו ישמור את הסריקה במכשיר;
              התוצאה (מומש, פג תוקף, כבר מומש) תתקבל בסנכרון.
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
                {submitting ? 'מבצע...' : checked ? 'אשר ומַמֵש' : 'שמור לסנכרון'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'result' && result) {
    return (
      <div className="space-y-4">
        {queuePanel}
        <ResultCard result={result} onReset={reset} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {queuePanel}

      {cameraSupported && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className={cameraOn ? 'space-y-3' : 'hidden'}>
            <video
              ref={videoRef}
              className="aspect-square w-full rounded-xl bg-black object-cover"
              playsInline
              muted
            />
            <button
              type="button"
              onClick={stopCamera}
              className="w-full rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700"
            >
              עצור מצלמה
            </button>
          </div>
          {!cameraOn && (
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
        <label htmlFor="merchant-voucher-code" className="block text-sm font-medium text-gray-700">
          הקלדת קוד ידנית
        </label>
        <input
          id="merchant-voucher-code"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="XXXXX-XXXXX או 1234-5678"
          dir="ltr"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center font-mono text-lg tracking-widest text-gray-900 placeholder:text-gray-300 focus:border-gray-900 focus:outline-none"
        />
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={checking}
          className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {checking ? 'בודק...' : online ? 'בדוק שובר' : 'המשך בלי חיבור'}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400">מחובר כ-{supplierName}</p>
    </div>
  )
}

function QueuePanel({
  online,
  queue,
  syncing,
  lastDrain,
  onSync,
}: {
  online: boolean
  queue: QueuedScan[]
  syncing: boolean
  lastDrain: DrainResult | null
  onSync: () => void
}) {
  const drained = lastDrain?.kind === 'drained' ? lastDrain : null
  const note =
    lastDrain && lastDrain.kind !== 'drained' && lastDrain.kind !== 'empty'
      ? DRAIN_MESSAGES[lastDrain.kind]
      : null

  return (
    <section
      aria-label="מצב החיבור והתור"
      className={`rounded-2xl border p-3 text-sm ${
        online ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold" data-testid="connection-state">
          {online ? 'מחובר' : 'אין חיבור'}
          {queue.length > 0 && (
            <span className="ms-2 rounded-full bg-gray-900 px-2 py-0.5 text-xs font-bold text-white">
              {queue.length} ממתינות
            </span>
          )}
        </p>
        {queue.length > 0 && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing || !online}
            className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            {syncing ? 'מסנכרן...' : 'סנכרן עכשיו'}
          </button>
        )}
      </div>
      {queue.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-gray-500">
          {queue.slice(0, 5).map((item) => (
            <li key={item.idempotencyKey} className="flex justify-between">
              <span className="font-mono" dir="ltr">
                {item.label}
              </span>
              <span>{formatCouponDate(item.scannedAt)}</span>
            </li>
          ))}
          {queue.length > 5 && <li>ועוד {queue.length - 5}</li>}
        </ul>
      )}
      {note && <p className="mt-2 text-xs text-amber-800">{note}</p>}
      {drained && drained.results.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs" aria-label="תוצאות הסנכרון האחרון">
          {drained.results.map((r) => (
            <li key={r.idempotency_key} className="flex justify-between">
              <span className="font-mono" dir="ltr">
                {r.code ? formatCouponCode(r.code) : 'QR'}
              </span>
              <span className={r.outcome === 'success' ? 'text-green-700' : 'text-red-700'}>
                {r.message ?? r.outcome}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ResultCard({ result, onReset }: { result: SubmitResult; onReset: () => void }) {
  if (result.kind === 'queued') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <p className="text-center text-lg font-bold text-amber-800">נשמר בתור, ממתין לסנכרון</p>
        <p className="mt-2 text-center text-sm text-amber-800">
          השובר לא מומש עדיין. הוא יישלח אוטומטית כשהחיבור יחזור, והתוצאה תוצג כאן.
        </p>
        <p className="mt-2 text-center text-xs text-amber-700">{result.pending} סריקות ממתינות</p>
        <button
          type="button"
          onClick={onReset}
          className="mt-5 w-full rounded-xl bg-heading py-3 text-sm font-bold text-white"
        >
          סריקה נוספת
        </button>
      </div>
    )
  }

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
        onClick={onReset}
        className="mt-5 w-full rounded-xl bg-heading py-3 text-sm font-bold text-white"
      >
        סריקה נוספת
      </button>
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
