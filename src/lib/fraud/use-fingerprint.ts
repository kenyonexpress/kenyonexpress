'use client'

import { useEffect, useState } from 'react'

/**
 * The events that mean a shopper has started using the page. A checkout cannot
 * be submitted without one of them (a click, a tap or an Enter), so starting
 * on the first one always beats the submit.
 */
const FIRST_INTERACTION = ['pointerdown', 'keydown', 'focusin', 'touchstart'] as const

/**
 * F66: Capture device fingerprint using FingerprintJS
 * Used for fraud detection on orders
 *
 * LAZY, AND STARTED ON THE FIRST INTERACTION, NOT ON MOUNT. The library was a
 * static import and ran `get()` in a mount effect: 26 KB gz in the checkout's
 * first-load JS, and its audio, canvas and WebGL probes measured 1.1 s of
 * scripting at Lighthouse's 4x CPU, one 884 ms long task, TBT 940 ms and
 * mobile perf 60 on /checkout (C181). The value is read only by the hidden
 * input at submit, so nothing needs it while the page loads.
 */
export function useDeviceFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let started = false

    async function getFingerprint() {
      if (started) return
      started = true
      for (const type of FIRST_INTERACTION) document.removeEventListener(type, getFingerprint, true)
      try {
        const { default: FingerprintJS } = await import('@fingerprintjs/fingerprintjs')
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

    for (const type of FIRST_INTERACTION) {
      document.addEventListener(type, getFingerprint, { capture: true, passive: true })
    }

    return () => {
      mounted = false
      for (const type of FIRST_INTERACTION) document.removeEventListener(type, getFingerprint, true)
    }
  }, [])

  return { fingerprint, loading }
}
