'use client'

import { useEffect } from 'react'

/**
 * Registers public/sw.js, and only in production.
 *
 * Registering in development is actively harmful here: `next dev` serves
 * uncompiled chunk URLs that change on every edit, and a worker that has
 * claimed the origin will keep answering for them. It also survives switching
 * branches, which turns "the dev server is serving the wrong build" into a
 * bug that takes an afternoon to find.
 *
 * Deferred to the `load` event because registration competes with hydration for
 * the main thread, and this page group's LCP was fought for over goals
 * [15]-[21]. Nothing here is needed on the first paint.
 *
 * No `onbeforeinstallprompt` capture in this component: the install prompt is
 * its own concern and lives in InstallPrompt.tsx.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration must stay silent. The site works without it,
        // and this runs on every page load -- reporting it would flood Sentry
        // from any browser that blocks workers (private mode, some enterprise
        // policies) with an error nobody can act on.
      })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
