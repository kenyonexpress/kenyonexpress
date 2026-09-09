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
  /**
   * Current and pre-sale price, for the discount badge live paints over the
   * main image. Omit either one and no badge is drawn.
   *
   * UNIT-FREE ON PURPOSE, and the naming is deliberate rather than sloppy. A
   * percentage is a RATIO of two prices, so it is identical whether both are
   * agorot or both are shekels, and it needs no conversion. The product page
   * reads `kenyon_price` and `full_price` as the numeric shekels the hosted
   * schema still stores; calling these `*Agorot` would be a false claim about
   * the money path, and converting them here would invent an integer boundary
   * where none exists. The only contract is that BOTH are the same unit.
   */
  price?: number | null
  oldPrice?: number | null
}

/**
 * The badge live overlays on the product photo, e.g. "-49%".
 *
 * Same formula and same markup as CategoryProductCard, so a product cannot
 * advertise one discount in the grid and a different one on its own page. No
 * money is computed here and none is displayed -- only the ratio of two prices
 * the caller already has.
 */
function discountPercent(price: number, old: number): number {
  return Math.round((1 - price / old) * 100)
}

/**
 * electro-style product gallery: one large main image with a row of
 * thumbnails beneath it. Clicking a thumbnail swaps the main image.
 * Pipeline-registered images render with a blur placeholder and their
 * mandatory Hebrew alt text.
 */
export default function ProductGallery({
  images,
  name,
  assets = {},
  price = null,
  oldPrice = null,
}: Props) {
  const [active, setActive] = useState(0)

  // A badge is drawn only when there is a real reduction to state. Guarding on
  // `> 0` and not just on presence keeps a mispriced row from painting "-0%"
  // or, worse, a negative "discount".
  const pct =
    price != null && oldPrice != null && oldPrice > price ? discountPercent(price, oldPrice) : 0

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
        {pct > 0 && (
          <span className="pdp-gallery__badge">
            -<span className="percentage">{pct}%</span>
          </span>
        )}
        {/* `priority` on the FIRST image only, and it is the LCP fix rather than
            a tuning knob. Measured against production on 2026-09-01, the mobile
            product page scored 87 with a Largest Contentful Paint of 3.6s, and
            Lighthouse's own discovery checklist said why in three lines:

              fetchpriority=high should be applied ............ false
              Request is discoverable in initial document ..... false
              LCP resources should not use loading=lazy ....... false

            with `resourceLoadDelay` at 1313ms. This is a client component, so
            without the hint the browser only learns about the main photo after
            the bundle runs, and the largest element on the page starts loading
            more than a second late. `priority` emits fetchpriority="high",
            drops loading="lazy" and preloads it from the document.

            Gated on `active === 0` so it applies to the image that is actually
            painted first. Once a shopper picks a thumbnail the LCP has already
            happened, and marking every swapped-in image high-priority would
            just contend with whatever else is loading. */}
        <Image
          src={activeUrl}
          alt={activeAsset?.alt ?? name}
          fill
          priority={active === 0}
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
