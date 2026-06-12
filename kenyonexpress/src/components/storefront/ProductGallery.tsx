'use client'

import { useState } from 'react'

interface Props {
  images: string[]
  name: string
}

/**
 * electro-style product gallery: one large main image with a row of
 * thumbnails beneath it. Clicking a thumbnail swaps the main image.
 */
export default function ProductGallery({ images, name }: Props) {
  const [active, setActive] = useState(0)

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center text-7xl">
        📦
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="aspect-square bg-white rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center">
        <img src={images[active]} alt={name} className="w-full h-full object-contain" />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2 pb-1">
          {images.map((url, i) => (
            <button
              type="button"
              key={url}
              onClick={() => setActive(i)}
              aria-label={`תמונה ${i + 1}`}
              aria-current={i === active}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 bg-white transition-colors ${
                i === active ? 'border-brand-primary' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
