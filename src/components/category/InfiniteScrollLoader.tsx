'use client'

import { useEffect, useRef } from 'react'

type Props = {
  onLoadMore: () => void
  isLoading?: boolean
  hasMore?: boolean
}

export default function InfiniteScrollLoader({
  onLoadMore,
  isLoading = false,
  hasMore = true,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        const lastEntry = entries[entries.length - 1]
        if (lastEntry?.isIntersecting) {
          onLoadMore()
        }
      },
      { threshold: 0.5 },
    )

    const currentSentinel = sentinelRef.current
    if (currentSentinel) {
      observer.observe(currentSentinel)
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel)
      }
    }
  }, [onLoadMore, isLoading, hasMore])

  if (!hasMore) {
    return null
  }

  return (
    <div
      ref={sentinelRef}
      className="infinite-scroll-loader"
      aria-live="polite"
      aria-busy={isLoading}
    >
      {isLoading && <div className="infinite-scroll-loader__spinner" />}
    </div>
  )
}
