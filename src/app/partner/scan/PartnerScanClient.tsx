'use client'

import { parseScanInput } from '@/lib/vouchers/scan-input'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

// BarcodeDetector is not in the TS DOM lib yet.
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

/**
 * Partner QR scanner client component.
 *
 * Provides camera access via navigator.mediaDevices to scan voucher QR codes.
 * When a valid QR is detected, navigates to /redeem/[token] which:
 * - Validates the signature (via classifyVoucherQrPayload)
 * - Marks redeemed_at in the vouchers table
 * - Records the redemption in voucher_redemptions (idempotent)
 * - Shows the RESULT
 */
export default function PartnerScanClient() {
  const router = useRouter()
  const [cameraOn, setCameraOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)

  const cameraSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    streamRef.current = null
    detectorRef.current = null
    setCameraOn(false)
    setScanning(false)
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  const handleQrDetected = useCallback(
    (rawValue: string) => {
      stopCamera()
      setScanning(true)

      const parsed = parseScanInput(rawValue)

      if (parsed.kind === 'invalid') {
        setError('קוד QR לא תקין. נסו שוב או בקשו מהלקוח לפתוח את השובר מחדש.')
        setScanning(false)
        return
      }

      // Navigate to the redemption flow which validates signature and redeems
      if (parsed.token) {
        // QR contains the full signed token - navigate to redeem page
        router.push(`/redeem/${encodeURIComponent(parsed.token)}`)
      } else if (parsed.code) {
        // Manual code - would need token, but parseScanInput should handle this
        setError('קוד זה דורש אימות. אנא סרקו את קוד ה-QR של הלקוח.')
        setScanning(false)
      }
    },
    [router, stopCamera],
  )

  const startCamera = useCallback(async () => {
    setError(null)
    setScanning(false)

    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector

    if (!Detector) {
      setError('הדפדפן אינו תומך בסריקת QR. אנא השתמשו בדפדפן מודרני.')
      return
    }

    try {
      // Request camera access with back camera preferred
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      detectorRef.current = new Detector({ formats: ['qr_code'] })

      const video = videoRef.current
      if (!video) {
        stopCamera()
        return
      }

      video.srcObject = stream
      await video.play()
      setCameraOn(true)

      // Start detection loop
      const tick = async () => {
        if (!streamRef.current || !detectorRef.current) return

        try {
          const codes = await detectorRef.current.detect(video)
          const qrValue = codes[0]?.rawValue

          if (qrValue) {
            handleQrDetected(qrValue)
            return
          }
        } catch {
          // Transient decode error; keep scanning
        }

        rafRef.current = requestAnimationFrame(() => void tick())
      }

      rafRef.current = requestAnimationFrame(() => void tick())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'שגיאה לא ידועה'

      if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
        setError('אין הרשאה לגשת למצלמה. אנא אפשרו גישה למצלמה בהגדרות הדפדפן.')
      } else if (message.includes('NotFoundError') || message.includes('not found')) {
        setError('לא נמצאה מצלמה במכשיר זה.')
      } else {
        setError('לא ניתן לגשת למצלמה. ודאו שהמצלמה פנויה ושהדפדפן מורשה להשתמש בה.')
      }

      stopCamera()
    }
  }, [handleQrDetected, stopCamera])

  if (!cameraSupported) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="mb-3 text-4xl" aria-hidden="true">
          ⚠️
        </p>
        <h2 className="text-lg font-bold text-red-900">דפדפן לא נתמך</h2>
        <p className="mt-2 text-sm text-red-700">
          הדפדפן הזה אינו תומך בסריקת QR. אנא השתמשו ב-Chrome, Edge, או Safari עדכני.
        </p>
      </div>
    )
  }

  if (scanning) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <p className="text-sm font-medium text-blue-900">מעבד את השובר...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {cameraOn ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                className="w-full"
                playsInline
                autoPlay
                muted
                aria-label="תצוגת מצלמה חיה לסריקת QR"
              />

              {/* QR scanning frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-48 w-48">
                  {/* Corner markers */}
                  <div className="absolute left-0 top-0 h-12 w-12 border-l-4 border-t-4 border-green-400" />
                  <div className="absolute right-0 top-0 h-12 w-12 border-r-4 border-t-4 border-green-400" />
                  <div className="absolute bottom-0 left-0 h-12 w-12 border-b-4 border-l-4 border-green-400" />
                  <div className="absolute bottom-0 right-0 h-12 w-12 border-b-4 border-r-4 border-green-400" />
                </div>
              </div>
            </div>

            <p className="text-center text-sm text-gray-600">מכוונים את קוד ה-QR לתוך המסגרת</p>

            <button
              type="button"
              onClick={stopCamera}
              className="w-full rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              עצור מצלמה
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex h-64 items-center justify-center rounded-xl bg-gray-50">
              <div className="text-center">
                <svg
                  className="mx-auto h-16 w-16 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  role="img"
                  aria-label="סמל מצלמה"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <p className="mt-3 text-sm font-medium text-gray-600">לחצו להפעלת המצלמה</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void startCamera()}
              className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white transition hover:bg-gray-800"
            >
              הפעל מצלמה לסריקת QR
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-center text-sm font-medium text-red-900">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null)
              void startCamera()
            }}
            className="mt-3 w-full rounded-xl border border-red-300 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
          >
            נסה שוב
          </button>
        </div>
      )}

      <div className="rounded-xl bg-gray-50 p-4">
        <h3 className="text-sm font-medium text-gray-900">הוראות שימוש</h3>
        <ol className="mt-2 space-y-1 text-sm text-gray-600" dir="rtl">
          <li className="flex items-start gap-2">
            <span className="font-bold">1.</span>
            <span>לחצו על "הפעל מצלמה" ואפשרו גישה</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">2.</span>
            <span>כוונו את קוד ה-QR של הלקוח למרכז המסך</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">3.</span>
            <span>המערכת תסרוק אוטומטית ותעביר למימוש</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
