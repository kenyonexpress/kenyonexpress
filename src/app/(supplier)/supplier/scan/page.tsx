'use client'

import { createClient } from '@/lib/supabase/client'
import { verifySignedJWT } from '@/lib/vouchers/qr-generation'
import { useRef, useState } from 'react'

/**
 * Supplier scan page with camera + JWT verification.
 * F55: Uses camera, verifies JWT, marks coupon as redeemed.
 */

export default function SupplierScanPage() {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const supabase = createClient()

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setScanning(true)
        setError(null)
      }
    } catch (err) {
      setError('Failed to access camera')
      console.error('Camera error:', err)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }
    setScanning(false)
  }

  const scanQRCode = async (token: string) => {
    // Verify JWT
    const verified = verifySignedJWT(token)

    if (!verified) {
      setError('Invalid or expired QR code')
      return
    }

    try {
      // Mark coupon/voucher as redeemed
      const { data, error: redeemError } = await supabase
        .from('vouchers')
        .update({
          status: 'redeemed',
          redeemed_at: new Date().toISOString(),
        })
        .eq('id', verified.voucher_id)
        .eq('status', 'issued')
        .select()
        .single()

      if (redeemError || !data) {
        setError('Coupon already redeemed or not found')
        return
      }

      // Also mark order item
      await supabase
        .from('order_items')
        .update({ item_status: 'redeemed' })
        .eq('id', data.order_item_id)

      setResult(`Successfully redeemed voucher ${verified.voucher_id}`)
      stopCamera()
    } catch (err) {
      setError('Failed to redeem coupon')
      console.error('Redemption error:', err)
    }
  }

  const handleManualEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const input = form.elements.namedItem('token') as HTMLInputElement
    await scanQRCode(input.value)
  }

  return (
    <div style={{ padding: '20px', direction: 'rtl' }}>
      <h1>סריקת קופון</h1>

      {!scanning && !result && (
        <button
          type="button"
          onClick={startCamera}
          style={{ padding: '10px 20px', fontSize: '16px' }}
        >
          הפעל מצלמה
        </button>
      )}

      {scanning && (
        <div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', maxWidth: '500px' }}
          >
            <track kind="captions" />
          </video>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <button
            type="button"
            onClick={stopCamera}
            style={{ marginTop: '10px', padding: '10px 20px' }}
          >
            עצור סריקה
          </button>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <h2>הזנה ידנית</h2>
        <form onSubmit={handleManualEntry}>
          <input
            type="text"
            name="token"
            placeholder="הדבק JWT מהקופון"
            style={{ padding: '10px', width: '100%', maxWidth: '500px' }}
          />
          <button type="submit" style={{ marginTop: '10px', padding: '10px 20px' }}>
            מימוש
          </button>
        </form>
      </div>

      {error && <div style={{ marginTop: '20px', color: 'red' }}>שגיאה: {error}</div>}

      {result && <div style={{ marginTop: '20px', color: 'green' }}>✓ {result}</div>}
    </div>
  )
}
