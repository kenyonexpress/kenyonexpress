'use client'

import { useEffect } from 'react'

/**
 * Restores scroll position on back navigation and enables smooth scroll behavior.
 *
 * Tracks scroll position in sessionStorage and restores it on navigation,
 * handles both back button and bfcache restoration.
 */
export default function ScrollRestoration() {
  useEffect(() => {
    // Enable native scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto'
    }

    // Store current scroll position before navigation
    const handleBeforeUnload = () => {
      sessionStorage.setItem('scroll-y', window.scrollY.toString())
    }

    // Restore scroll on pageshow (covers both back button and bfcache)
    const handlePageShow = () => {
      const scrollY = sessionStorage.getItem('scroll-y')
      if (scrollY) {
        const y = Number.parseInt(scrollY, 10)
        window.scrollTo({
          top: y,
          left: 0,
          behavior: 'auto',
        })
      }
    }

    // Also restore immediately on load if coming from back button
    const scrollY = sessionStorage.getItem('scroll-y')
    if (scrollY && window.scrollY === 0) {
      const y = Number.parseInt(scrollY, 10)
      window.scrollTo({
        top: y,
        left: 0,
        behavior: 'auto',
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pageshow', handlePageShow as EventListener)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pageshow', handlePageShow as EventListener)
    }
  }, [])

  return null
}
