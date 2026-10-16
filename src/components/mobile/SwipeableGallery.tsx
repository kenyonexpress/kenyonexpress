'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'

interface SwipeableGalleryProps {
  images: string[]
  alt: string
}

const SWIPE_THRESHOLD = 50

export default function SwipeableGallery({ images, alt }: SwipeableGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    setDragStart(e.touches[0]?.clientX ?? 0)
  }

  const handleTouchMove = (_e: React.TouchEvent) => {
    if (!isDragging) return
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging) return
    setIsDragging(false)

    const dragEnd = e.changedTouches[0]?.clientX
    if (!dragEnd) return
    const distance = dragStart - dragEnd

    if (Math.abs(distance) > SWIPE_THRESHOLD) {
      if (distance > 0) {
        // Swiped left, show next image
        setCurrentIndex((prev) => (prev + 1) % images.length)
      } else {
        // Swiped right, show previous image
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
      }
    }
  }

  const goToSlide = (index: number) => {
    setCurrentIndex(index)
  }

  if (!images.length) return null

  return (
    <div
      className="relative bg-gray-100 overflow-hidden md:block"
      ref={containerRef}
      data-swipeable-gallery
    >
      {/* Image Container */}
      <div
        className="relative w-full overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ aspectRatio: '1' }}
      >
        {images.map((image, index) => (
          <div
            key={image}
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: index === currentIndex ? 1 : 0,
              pointerEvents: index === currentIndex ? 'auto' : 'none',
            }}
          >
            <Image
              src={image}
              alt={`${alt} - תמונה ${index + 1}`}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ))}
      </div>

      {/* Dot Indicator */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => goToSlide(index)}
              className={`
                w-2 h-2 rounded-full transition-colors
                ${index === currentIndex ? 'bg-yellow-400' : 'bg-gray-400 hover:bg-gray-500'}
              `}
              aria-label={`תמונה ${index + 1}`}
              aria-current={index === currentIndex}
            />
          ))}
        </div>
      )}
    </div>
  )
}
