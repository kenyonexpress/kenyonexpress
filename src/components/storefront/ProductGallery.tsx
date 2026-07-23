'use client'

import Image from 'next/image'
import { useState } from 'react'

export interface GalleryAsset {
  alt: string | null
  blurDataURL: string | null
}

interface Props {
  images: string[]
  name: string
  /** media_assets metadata keyed by image URL (blur placeholder + Hebrew alt). */
  assets?: Record<string, GalleryAsset>
}

/**
 * electro-style product gallery: one large main image with a row of
 * thumbnails beneath it. Clicking a thumbnail swaps the main image.
 * Pipeline-registered images render with a blur placeholder and their
 * mandatory Hebrew alt text.
 */
export default function ProductGallery({ images, name, assets = {} }: Props) {
  const [active, setActive] = useState(0)

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center text-7xl">
        📦
      </div>
    )
  }

  const activeUrl = images[active] as string
  const activeAsset = assets[activeUrl]

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-square bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Image
          src={activeUrl}
          alt={activeAsset?.alt ?? name}
          fill
          sizes="(max-width: 768px) 100vw, 40vw"
          className="object-contain"
          {...(activeAsset?.blurDataURL
            ? { placeholder: 'blur' as const, blurDataURL: activeAsset.blurDataURL }
            : {})}
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2 pb-1">
          {images.map((url, i) => (
            <button
              type="button"
              key={url}
              onClick={() => setActive(i)}
              aria-label={assets[url]?.alt ?? `תמונה ${i + 1}`}
              aria-current={i === active}
              className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 bg-white transition-colors ${
                i === active ? 'border-brand-primary' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="64px"
                className="object-contain"
                {...(assets[url]?.blurDataURL
                  ? { placeholder: 'blur' as const, blurDataURL: assets[url]?.blurDataURL ?? '' }
                  : {})}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
