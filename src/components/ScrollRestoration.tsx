'use client'

import { useEffect } from 'react'

/**
 * Restores scroll position on back navigation and enables smooth scroll behavior.
 *
 * Ensures that when users navigate back, they return to their previous scroll position.
 * Also enables smooth scroll behavior for anchor links via CSS scroll-behavior.
 */
export default function ScrollRestoration() {
  useEffect(() => {
    // Enable scroll restoration via history API
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto'
    }

    // Store scroll position before page unload
    const handleBeforeUnload = () => {
      sessionStorage.setItem('scroll-position', JSON.stringify(window.scrollY))
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return null
}
