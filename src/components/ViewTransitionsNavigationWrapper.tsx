'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect } from 'react'

/**
 * Enables View Transitions API for all client-side navigation.
 *
 * Wraps the router to trigger startViewTransition() on navigation when supported.
 * Gracefully degrades in unsupported browsers.
 */
export default function ViewTransitionsNavigationWrapper({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    // Only patch if View Transitions API is available
    if (!('startViewTransition' in document)) {
      return
    }

    // Store the original methods
    const originalPush = router.push
    const originalReplace = router.replace
    const originalBack = router.back
    const originalForward = router.forward

    // Wrap push with view transition
    const wrappedPush = function (
      this: typeof router,
      href: string,
      options?: Record<string, unknown>,
    ) {
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          originalPush.call(this, href, options)
        })
      } else {
        originalPush.call(this, href, options)
      }
      return Promise.resolve()
    }
    router.push = wrappedPush as typeof router.push

    // Wrap replace with view transition
    const wrappedReplace = function (
      this: typeof router,
      href: string,
      options?: Record<string, unknown>,
    ) {
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          originalReplace.call(this, href, options)
        })
      } else {
        originalReplace.call(this, href, options)
      }
      return Promise.resolve()
    }
    router.replace = wrappedReplace as typeof router.replace

    // Wrap back with view transition
    const wrappedBack = function (this: typeof router) {
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          originalBack.call(this)
        })
      } else {
        originalBack.call(this)
      }
    }
    router.back = wrappedBack as typeof router.back

    // Wrap forward with view transition
    const wrappedForward = function (this: typeof router) {
      if (document.startViewTransition) {
        document.startViewTransition(() => {
          originalForward.call(this)
        })
      } else {
        originalForward.call(this)
      }
    }
    router.forward = wrappedForward as typeof router.forward

    return () => {
      // Restore original methods on unmount
      router.push = originalPush
      router.replace = originalReplace
      router.back = originalBack
      router.forward = originalForward
    }
  }, [router])

  return <>{children}</>
}
