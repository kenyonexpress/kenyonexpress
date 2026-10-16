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
    // Enable native scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto'
    }

    // Restore scroll position when page loads (for browser back button)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Browser restored the page from bfcache - scroll is auto-restored
        window.scrollTo({
          top: sessionStorage.getItem('scroll-position')
            ? JSON.parse(sessionStorage.getItem('scroll-position') || '0')
            : 0,
          left: 0,
          behavior: 'auto',
        })
      }
    }

    // Store scroll position on page hide (for browser back)
    const handlePageHide = () => {
      sessionStorage.setItem('scroll-position', JSON.stringify(window.scrollY))
    }

    window.addEventListener('pageshow', handlePageShow as EventListener)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pageshow', handlePageShow as EventListener)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  return null
}
