'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

interface SwipeableGalleryProps {
  images: string[]
  alt: string
}

export default function SwipeableGallery({ images, alt }: SwipeableGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const startXRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startXRef.current = e.touches?.[0]?.clientX ?? null
  }, [])

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!startXRef.current) return

      const endX = e.changedTouches?.[0]?.clientX ?? null
      if (endX === null) return

      const distance = startXRef.current - endX

      if (distance > 50) {
        setCurrentIndex((prev) => (prev + 1) % images.length)
      } else if (distance < -50) {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
      }

      startXRef.current = null
    },
    [images.length],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('touchstart', handleTouchStart as EventListener)
    container.addEventListener('touchend', handleTouchEnd as EventListener)

    return () => {
      container.removeEventListener('touchstart', handleTouchStart as EventListener)
      container.removeEventListener('touchend', handleTouchEnd as EventListener)
    }
  }, [handleTouchStart, handleTouchEnd])

  return (
    <div ref={containerRef} data-swipeable-gallery className="w-full md:hidden">
      <div className="relative w-full bg-gray-100 overflow-hidden rounded-lg">
        <div className="flex transition-opacity duration-300">
          {images.map((image, index) => (
            <div
              key={image}
              className="w-full flex-shrink-0"
              style={{
                opacity: index === currentIndex ? 1 : 0,
                display: index === currentIndex ? 'block' : 'none',
              }}
            >
              <Image
                src={image}
                alt={`${alt} - תמונה ${index + 1}`}
                width={400}
                height={400}
                className="w-full h-auto object-cover"
                priority={index === 0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-2">
        {images.map((image, idx) => (
          <button
            key={image}
            type="button"
            onClick={() => setCurrentIndex(idx)}
            className={`h-2 rounded-full transition-colors ${
              idx === currentIndex ? 'bg-brand w-6' : 'bg-gray-300 w-2'
            }`}
            aria-label={`תמונה ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
