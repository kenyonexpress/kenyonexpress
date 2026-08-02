'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Re-runs the server reconcile every few seconds while the payment settles. */
export default function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(t)
  }, [router, intervalMs])
  return null
}
