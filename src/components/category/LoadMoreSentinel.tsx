'use client'

import { useEffect, useRef } from 'react'

/**
 * Fires onLoadMore when this node enters the viewport.
 *
 * The shop archive appends pages rather than replacing them. A clickable
 * "next" control cannot see the bottom of a 20-card grid the way a sentinel
 * can, and the observer is disconnected on unmount so a sort change cannot
 * leak a fetch into the next listing.
 */
export default function LoadMoreSentinel({ onLoadMore }: { onLoadMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [onLoadMore])

  return <div ref={ref} data-testid="load-more-sentinel" className="w-full" aria-hidden="true" />
}
