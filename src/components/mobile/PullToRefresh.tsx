'use client'

import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  /**
   * Asked at the start of each pull, in the browser, whether this page takes
   * pull-to-refresh. Deciding here instead of choosing whether to render the
   * component keeps the server and client trees identical on every path.
   */
  enabled?: (pathname: string) => boolean
}

export default function PullToRefresh({ onRefresh, children, enabled }: PullToRefreshProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startYRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (enabled && !enabled(window.location.pathname)) return
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      if (scrollTop === 0) {
        startYRef.current = e.touches?.[0]?.clientY ?? null
      }
    },
    [enabled],
  )

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!startYRef.current || isLoading) return

      const currentY = e.changedTouches?.[0]?.clientY ?? null
      if (currentY === null) return

      const distance = currentY - startYRef.current
      if (distance > 0) {
        setPullDistance(Math.min(distance, 120))
      }
    },
    [isLoading],
  )

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= 80 && !isLoading) {
      setIsLoading(true)
      await onRefresh()
      setIsLoading(false)
    }
    setPullDistance(0)
    startYRef.current = null
  }, [pullDistance, isLoading, onRefresh])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('touchstart', handleTouchStart as EventListener)
    container.addEventListener('touchmove', handleTouchMove as EventListener)
    container.addEventListener('touchend', handleTouchEnd as EventListener)

    return () => {
      container.removeEventListener('touchstart', handleTouchStart as EventListener)
      container.removeEventListener('touchmove', handleTouchMove as EventListener)
      container.removeEventListener('touchend', handleTouchEnd as EventListener)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  // `contents`: the wrapper takes no box, so wrapping a page changes nothing
  // in its layout. Touch events still bubble through it to the listeners.
  return (
    <div ref={containerRef} data-pull-to-refresh className="contents">
      {pullDistance > 0 && (
        <div
          className="flex justify-center items-center h-12 bg-brand text-gray-900 transition-transform"
          style={{ transform: `translateY(${pullDistance}px)` }}
        >
          <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
        </div>
      )}
      {children}
    </div>
  )
}
