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
      <div data-pdp="gallery">
        <div className="pdp-gallery__frame pdp-gallery__frame--empty">📦</div>
      </div>
    )
  }

  const activeUrl = images[active] as string
  const activeAsset = assets[activeUrl]

  return (
    <div data-pdp="gallery">
      {/* Main image. Live's frame is 470px square with no border or radius, so
          neither is drawn here: an outline where live has bare photo is a
          contour the pixel comparison sees on every edge. */}
      <div className="pdp-gallery__frame">
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
        <div className="pdp-gallery__thumbs">
          {images.map((url, i) => (
            <button
              type="button"
              key={url}
              onClick={() => setActive(i)}
              aria-label={assets[url]?.alt ?? `תמונה ${i + 1}`}
              aria-current={i === active}
              className="pdp-gallery__thumb"
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
