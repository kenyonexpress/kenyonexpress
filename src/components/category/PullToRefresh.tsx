'use client'

import { motion, useMotionValue, useTransform } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

const PULL_THRESHOLD = 100
const PULL_MAX = 200

interface PullToRefreshProps {
  children: React.ReactNode
  categorySlug: string
}

export default function PullToRefresh({ children, categorySlug }: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const pullDownStartY = useRef<number | null>(null)
  const isScrolled = useRef(false)
  const y = useMotionValue(0)

  const opacity = useTransform(y, [0, PULL_THRESHOLD], [0, 1])
  const scale = useTransform(y, [0, PULL_THRESHOLD], [0.5, 1])

  const handleRefresh = useCallback(async () => {
    try {
      // Revalidate the category page by calling the revalidate API
      const response = await fetch(`/api/catalog/page?slug=${categorySlug}`, {
        headers: { accept: 'application/json' },
      })
      if (response.ok) {
        // Refresh the page to show updated data
        window.location.reload()
      }
    } catch {
      // Silent fail - refresh will be retried on next pull
    }
  }, [categorySlug])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const scrollElement = document.documentElement
    isScrolled.current = (scrollElement.scrollTop ?? 0) > 0
    if (!isScrolled.current) {
      pullDownStartY.current = e.touches[0]?.clientY ?? null
    }
  }, [])

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing || pullDownStartY.current === null || isScrolled.current) {
        return
      }

      const touchY = e.touches[0]?.clientY
      const diff =
        touchY != null && pullDownStartY.current != null ? touchY - pullDownStartY.current : 0
      if (diff > 0) {
        e.preventDefault()
        const clamped = Math.min(diff, PULL_MAX)
        y.set(clamped)
      }
    },
    [isRefreshing, y],
  )

  const handleTouchEnd = useCallback(async () => {
    const currentY = y.get()
    pullDownStartY.current = null

    if (currentY >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await handleRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }

    y.set(0)
  }, [y, handleRefresh, isRefreshing])

  useEffect(() => {
    const element = document.documentElement
    element.addEventListener('touchstart', handleTouchStart as EventListener)
    element.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false })
    element.addEventListener('touchend', handleTouchEnd as EventListener)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart as EventListener)
      element.removeEventListener('touchmove', handleTouchMove as EventListener)
      element.removeEventListener('touchend', handleTouchEnd as EventListener)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return (
    <div>
      <motion.div
        className="pull-to-refresh__indicator"
        style={{
          y,
          opacity,
          scale,
        }}
        animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
        transition={
          isRefreshing
            ? { duration: 1, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }
            : { duration: 0.3 }
        }
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="רענון"
        >
          <title>רענון</title>
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.88" />
        </svg>
      </motion.div>
      <div>{children}</div>
    </div>
  )
}
