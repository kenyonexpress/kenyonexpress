'use client'

import { type RefObject, useEffect, useState } from 'react'

/**
 * True while the element has scrolled off the TOP of the viewport: it was on
 * screen, the shopper read past it, and it is now above them. False while it
 * is on screen and false while it is still below the fold, so a control that
 * mirrors it (the product page's sticky buy bar) appears only after the real
 * one has been passed, never on first paint and never in a full-page capture.
 *
 * One IntersectionObserver per element, no scroll listener: the browser fires
 * the callback on the thresholds crossing and nothing runs on every frame.
 * Engines without the API (and jsdom) keep the element "not passed", which is
 * the state in which nothing extra is rendered.
 */
export function useScrolledPast(ref: RefObject<Element | null>): boolean {
  const [passed, setPassed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Above the viewport means the element's bottom edge is over the
          // top edge. Below the fold has a positive top and does not count.
          setPassed(!entry.isIntersecting && entry.boundingClientRect.bottom < 0)
        }
      },
      {
        threshold: 0,
        // The root is the viewport plus everything BELOW it. MEASURED: with
        // the bare viewport, a phone whose buy row starts below the fold
        // (y1010 on a 900px screen) jumped past it in one scroll and the
        // observer never fired, because the row went from "not intersecting,
        // below" to "not intersecting, above" with no crossing in between.
        // Extending the root downwards makes "below" count as intersecting,
        // so the only way to stop intersecting is to leave over the top.
        rootMargin: '0px 0px 100000px 0px',
      },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return passed
}
