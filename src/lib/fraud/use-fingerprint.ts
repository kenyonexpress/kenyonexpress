'use client'

import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { useEffect, useState } from 'react'

/**
 * F66: Capture device fingerprint using FingerprintJS
 * Used for fraud detection on orders
 */
export function useDeviceFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function getFingerprint() {
      try {
        const fp = await FingerprintJS.load()
        const result = await fp.get()

        if (mounted) {
          setFingerprint(result.visitorId)
          setLoading(false)
        }
      } catch {
        // Fingerprint is a best-effort fraud signal; orders proceed without it.
        if (mounted) {
          setFingerprint(null)
          setLoading(false)
        }
      }
    }

    getFingerprint()

    return () => {
      mounted = false
    }
  }, [])

  return { fingerprint, loading }
}
