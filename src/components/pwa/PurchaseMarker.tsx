'use client'

import { useEffect } from 'react'

/** Remembers, in this browser, that a purchase completed. Renders nothing. */
export default function PurchaseMarker() {
  useEffect(() => {
    try {
      localStorage.setItem('ke:purchased', '1')
    } catch {
      // Private mode or blocked storage: the install offer simply never shows.
    }
  }, [])
  return null
}
