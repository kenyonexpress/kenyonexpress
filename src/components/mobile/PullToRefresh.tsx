'use client'

import { RefreshCw } from '@/components/icons'
import { useEffect, useRef, useState } from 'react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
}

const PULL_THRESHOLD = 80
const TRIGGER_THRESHOLD = 120

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startYRef = useRef(0)
  const isScrolledRef = useRef(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const checkScroll = () => {
      isScrolledRef.current = element.scrollTop > 0
    }

    element.addEventListener('scroll', checkScroll)

    const handleTouchStart = (e: TouchEvent) => {
      if (isScrolledRef.current || isRefreshing) return
      startYRef.current = e.touches[0]?.clientY ?? 0
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (isScrolledRef.current || isRefreshing) return

      const currentY = e.touches[0]?.clientY
      if (!currentY) return
      const distance = currentY - startYRef.current

      if (distance > 0) {
        e.preventDefault()
        setPullDistance(Math.min(distance, TRIGGER_THRESHOLD))
      }
    }

    const handleTouchEnd = async () => {
      if (pullDistance >= TRIGGER_THRESHOLD && !isRefreshing) {
        setIsRefreshing(true)
        try {
          await onRefresh()
        } finally {
          setIsRefreshing(false)
        }
      }
      setPullDistance(0)
    }

    element.addEventListener('touchstart', handleTouchStart)
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd)

    return () => {
      element.removeEventListener('scroll', checkScroll)
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [pullDistance, isRefreshing, onRefresh])

  const showPull = pullDistance > 0
  const isReady = pullDistance >= TRIGGER_THRESHOLD
  const opacity = Math.min(pullDistance / PULL_THRESHOLD, 1)

  return (
    <div ref={containerRef} className="relative overflow-y-auto" data-pull-to-refresh>
      {showPull && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center bg-white border-b border-gray-200 transition-all duration-200"
          style={{
            height: `${Math.min(pullDistance, 60)}px`,
            opacity,
          }}
        >
          <div className={`transition-transform duration-200 ${isReady ? 'rotate-180' : ''}`}>
            <RefreshCw className={`w-6 h-6 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          </div>
          <span className="text-sm text-gray-600 ml-2">
            {isRefreshing ? 'טוען...' : isReady ? 'שחרר לרענון' : 'משוך לרענון'}
          </span>
        </div>
      )}
      {children}
    </div>
  )
}
