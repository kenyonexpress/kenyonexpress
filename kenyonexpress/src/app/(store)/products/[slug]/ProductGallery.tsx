'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface Props {
  images: string[]
  name: string
}

export default function ProductGallery({ images, name }: Props) {
  const [active, setActive] = useState(0)

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-gray-50 flex items-center justify-center text-6xl">📦</div>
    )
  }

  const prev = () => setActive((i) => (i === 0 ? images.length - 1 : i - 1))
  const next = () => setActive((i) => (i === images.length - 1 ? 0 : i + 1))

  return (
    <div>
      <div className="aspect-square bg-gray-50 relative overflow-hidden">
        <img src={images[active]} alt={name} className="w-full h-full object-cover" />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="תמונה קודמת"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="תמונה הבאה"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((url, i) => (
                <button
                  type="button"
                  key={url}
                  onClick={() => setActive(i)}
                  aria-label={`תמונה ${i + 1}`}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === active ? 'bg-brand' : 'bg-white/70'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 p-3 overflow-x-auto">
          {images.map((url, i) => (
            <button
              type="button"
              key={url}
              onClick={() => setActive(i)}
              className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                i === active ? 'border-brand' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
