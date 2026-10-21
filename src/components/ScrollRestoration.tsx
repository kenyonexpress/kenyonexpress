'use client'

import { useEffect } from 'react'

/**
 * Restores the scroll position on a back/forward return to a page.
 *
 * SCOPED TO THE PAGE IT WAS SAVED ON, AND TO A RETURN. The first version saved
 * `scrollY` on every `beforeunload` and put it back on ANY load that started at
 * the top, with no idea which page either number belonged to. So a shopper who
 * scrolled a product page 729px, pressed the buy button and was sent to
 * /checkout arrived at /checkout scrolled 729px into a page that had not
 * streamed its body yet; the form then landed above the fold and pushed the
 * footer out of it. MEASURED 2026-10-21 on the production build at Pixel 5:
 * `window.scrollTo({top: 729})` from this component 64ms into /checkout, CLS
 * 0.4515 against the 0.1 budget, the whole of it one footer shift. Every full
 * navigation on the site (the consent decision, a server-action redirect, a
 * typed URL) was eligible for the same wrong scroll.
 *
 * The entry now carries the path it was taken on, is only applied to that
 * same path, and only when the visitor is coming BACK to it: a bfcache
 * `pageshow` (`persisted`) or a `back_forward` navigation. A forward
 * navigation keeps the browser's own behaviour, which is the top of the page.
 */
const KEY = 'scroll-y'

type SavedPosition = { path: string; y: number }

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`
}

function readSaved(): SavedPosition | null {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as SavedPosition).path === 'string' &&
      typeof (parsed as SavedPosition).y === 'number'
    ) {
      return parsed as SavedPosition
    }
  } catch {
    // An entry written by the older, unscoped version of this component (a
    // bare number) is exactly the kind that must not be applied.
  }
  return null
}

function isBackForwardNavigation(): boolean {
  const entry = performance.getEntriesByType?.('navigation')?.[0] as
    | PerformanceNavigationTiming
    | undefined
  return entry?.type === 'back_forward'
}

export default function ScrollRestoration() {
  useEffect(() => {
    // Enable native scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto'
    }

    const save = () => {
      const saved: SavedPosition = { path: currentPath(), y: window.scrollY }
      sessionStorage.setItem(KEY, JSON.stringify(saved))
    }

    const restore = () => {
      const saved = readSaved()
      if (!saved || saved.path !== currentPath()) return
      window.scrollTo({ top: saved.y, left: 0, behavior: 'auto' })
    }

    // bfcache return: the page comes back with its DOM, pageshow is persisted.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restore()
    }

    // A back/forward load without bfcache: a fresh document, at the top.
    if (isBackForwardNavigation() && window.scrollY === 0) restore()

    window.addEventListener('beforeunload', save)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('beforeunload', save)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  return null
}
