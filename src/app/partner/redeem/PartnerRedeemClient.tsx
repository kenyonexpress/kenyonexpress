'use client'

import { t } from '@/lib/i18n/messages'
import { formatAgorot } from '@/lib/vouchers/coupon-view'
import { newIdempotencyKey } from '@/lib/vouchers/offline-queue'
import { parsePartnerInput } from '@/lib/vouchers/partner-input'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The partner redeem form. One field, one button, and the camera when the
 * browser has BarcodeDetector.
 *
 * IDEMPOTENCY. One key per attempt, held in a ref. A network failure keeps it,
 * so pressing again retries the SAME attempt and the server answers with the
 * first result (`replayed`) rather than "already redeemed" for a coupon this
 * till just burned. Any answer from the server, success or refusal, ends the
 * attempt and the next submit gets a new key. The button is disabled while a
 * request is in flight, so a double tap sends one request.
 */

type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

type Voucher = {
  code: string | null
  product_name: string | null
  customer_name: string | null
  remaining_amount_due_agorot: number | null
}

type Answer = {
  outcome: string
  message: string
  replayed?: boolean
  voucher?: Voucher
}

export default function PartnerRedeemClient({ supplierName }: { supplierName: string }) {
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraSupported, setCameraSupported] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const keyRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    setCameraSupported('BarcodeDetector' in window)
  }, [])

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    setCameraOn(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const submit = useCallback(async (raw: string, method: 'camera' | 'manual') => {
    setError(null)
    if (parsePartnerInput(raw).kind === 'invalid') {
      setError(t('partnerRedeem.invalidInput'))
      return
    }
    if (!keyRef.current) keyRef.current = newIdempotencyKey()
    setPending(true)
    try {
      const response = await fetch('/api/partner/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: raw, idempotency_key: keyRef.current, method }),
      })
      const body = (await response.json().catch(() => null)) as Answer | null
      if (!body) throw new Error('empty')
      if (response.status >= 500) {
        // Infrastructure failure: the burn may or may not have happened, so
        // the key is kept and the next press retries the same attempt.
        setError(body.message)
        return
      }
      keyRef.current = null
      setAnswer(body)
      if (body.outcome === 'success') setValue('')
    } catch {
      setError(t('partnerRedeem.noConnection'))
    } finally {
      setPending(false)
    }
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector
    if (!Detector) return
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
          const found = (await detector.detect(video))[0]?.rawValue
          if (found) {
            stopCamera()
            keyRef.current = null
            void submit(found, 'camera')
            return
          }
        } catch {
          // a frame that failed to decode; keep scanning
        }
        rafRef.current = requestAnimationFrame(() => void tick())
      }
      rafRef.current = requestAnimationFrame(() => void tick())
    } catch {
      setError(t('partnerRedeem.cameraDenied'))
      stopCamera()
    }
  }, [stopCamera, submit])

  const success = answer?.outcome === 'success'

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-gray-500">
        {t('partnerRedeem.business')} {supplierName}
      </p>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(value, 'manual')
        }}
      >
        <label htmlFor="partner-redeem-input" className="block text-sm font-medium text-gray-900">
          {t('partnerRedeem.label')}
        </label>
        <input
          id="partner-redeem-input"
          name="input"
          dir="ltr"
          autoComplete="off"
          inputMode="numeric"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            keyRef.current = null
          }}
          placeholder="12345678"
          className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-center text-lg tracking-widest"
        />
        <button
          type="submit"
          disabled={pending || value.trim().length === 0}
          className="min-h-11 w-full rounded-lg bg-yellow-400 font-bold text-gray-900 disabled:opacity-50"
        >
          {pending ? t('partnerRedeem.submitting') : t('partnerRedeem.submit')}
        </button>
      </form>

      {cameraSupported && !cameraOn ? (
        <button
          type="button"
          onClick={() => void startCamera()}
          disabled={pending}
          className="min-h-11 w-full rounded-lg border border-gray-300 font-medium text-gray-900"
        >
          {t('partnerRedeem.camera')}
        </button>
      ) : null}
      {/* One element, always mounted, so startCamera's ref is the one shown. */}
      <video
        ref={videoRef}
        hidden={!cameraOn}
        className="w-full rounded-lg bg-black"
        muted
        playsInline
      />
      {cameraOn ? (
        <button
          type="button"
          onClick={stopCamera}
          className="min-h-11 w-full rounded-lg border border-gray-300 font-medium text-gray-900"
        >
          {t('partnerRedeem.cameraClose')}
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {answer ? (
        <div
          aria-live="polite"
          className={`rounded-lg p-4 ${success ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}
        >
          <p className="font-bold">{answer.message}</p>
          {success && answer.voucher ? (
            <dl className="mt-2 space-y-1 text-sm">
              {answer.voucher.product_name ? (
                <div>
                  <dt className="inline">{t('partnerRedeem.product')} </dt>
                  <dd className="inline">{answer.voucher.product_name}</dd>
                </div>
              ) : null}
              {answer.voucher.customer_name ? (
                <div>
                  <dt className="inline">{t('partnerRedeem.customer')} </dt>
                  <dd className="inline">{answer.voucher.customer_name}</dd>
                </div>
              ) : null}
              <div>
                <dt className="inline">{t('partnerRedeem.collect')} </dt>
                <dd className="inline font-bold">
                  {formatAgorot(answer.voucher.remaining_amount_due_agorot)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
