'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { type KeyboardEvent, type PointerEvent, useCallback, useRef, useState } from 'react'

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

/** Horizontal travel below which a pointer gesture is a tap, not a swipe. */
export const SWIPE_THRESHOLD_PX = 40
/** How far the zoomed photo is magnified. Live's zoom box is roughly 2x. */
export const ZOOM_SCALE = 2

/**
 * electro-style product gallery: one large main image with a row of
 * thumbnails beneath it. Clicking a thumbnail swaps the main image.
 * Pipeline-registered images render with a blur placeholder and their
 * mandatory Hebrew alt text.
 *
 * THREE WAYS TO MOVE, ONE STATE. A thumbnail click, a horizontal swipe on the
 * frame and the arrow keys all set `active`; the prev/next buttons exist for
 * a mouse and for a screen reader, which cannot swipe. Everything reads the
 * same index, so no path can show a thumbnail selected for a photo that is
 * not the one in the frame.
 *
 * ZOOM IS IN PLACE, NOT A LIGHTBOX. A tap (or click) magnifies the photo
 * inside its own 470px frame and the pointer pans it by moving the transform
 * origin; a second tap, an arrow, or Escape restores it. A modal would need
 * a focus trap, a scroll lock and its own close button, and would be the one
 * element on this page with no counterpart on live's template. Magnifying
 * inside the frame changes nothing about the layout the pixel gate measures.
 *
 * `priority` on the FIRST image only, and it is the LCP fix rather than a
 * tuning knob: measured against production on 2026-09-01 the mobile product
 * page scored 87 with an LCP of 3.6s because the main photo was discovered
 * only after the bundle ran. `priority` emits fetchpriority="high", drops
 * loading="lazy" and preloads it from the document. Gated on `active === 0`
 * so it applies to the image that is actually painted first.
 */
export default function ProductGallery({
  images,
  name,
  assets = {},
  price = null,
  oldPrice = null,
}: Props) {
  const [active, setActive] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null)

  const count = images.length
  const go = useCallback(
    (index: number) => {
      if (count === 0) return
      // Wraps, so the last photo's "next" is the first: a swipe past the end
      // that does nothing reads as a broken gesture.
      const next = ((index % count) + count) % count
      setActive(next)
      setZoomed(false)
    },
    [count],
  )

  // A badge is drawn only when there is a real reduction to state. Guarding on
  // `> 0` and not just on presence keeps a mispriced row from painting "-0%"
  // or, worse, a negative "discount".
  const pct =
    price != null && oldPrice != null && oldPrice > price ? discountPercent(price, oldPrice) : 0

  if (count === 0) {
    return (
      <div data-pdp="gallery">
        <div className="pdp-gallery__frame pdp-gallery__frame--empty">📦</div>
      </div>
    )
  }

  const activeUrl = images[active] as string
  const activeAsset = assets[activeUrl]

  const originFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    setOrigin({ x, y })
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    // jsdom and some older engines have no pointer capture; the gesture still
    // resolves on pointerup within the frame, which is the common case.
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (zoomed) originFromPointer(e)
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current
    gesture.current = null
    if (!start || start.id !== e.pointerId) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX || Math.abs(dy) >= SWIPE_THRESHOLD_PX) {
      // The finger travelled. Horizontal travel is a swipe: screen direction,
      // not reading direction, so the photo follows the finger whichever way
      // the page reads, and leftward travel reveals what is "next". Vertical
      // travel is the page scrolling under the finger and means nothing here.
      if (Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? active + 1 : active - 1)
      return
    }
    // Anything shorter is a tap: toggle the zoom where the finger landed.
    originFromPointer(e)
    setZoomed((z) => !z)
  }

  const onPointerCancel = () => {
    gesture.current = null
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // RTL: the "next" photo is to the LEFT, which is where ArrowLeft points.
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(active + 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(active - 1)
    } else if (e.key === 'Escape' && zoomed) {
      e.preventDefault()
      setZoomed(false)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setZoomed((z) => !z)
    }
  }

  return (
    <div data-pdp="gallery">
      {/* Main image. Live's frame is 470px square with no border or radius, so
          neither is drawn here: an outline where live has bare photo is a
          contour the pixel comparison sees on every edge. */}
      <section
        className="pdp-gallery__frame"
        data-zoomed={zoomed ? 'true' : undefined}
        aria-roledescription="גלריה"
        aria-label={`תמונות המוצר, תמונה ${active + 1} מתוך ${count}`}
        // The frame IS the keyboard target: arrows move, Enter zooms, Escape
        // restores. A carousel region that cannot take focus cannot be
        // operated without a pointer, and a button cannot wrap the arrows.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-operated carousel region, handlers on the element itself.
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        {pct > 0 && (
          <span className="pdp-gallery__badge">
            -<span className="percentage">{pct}%</span>
          </span>
        )}
        <div
          className="pdp-gallery__zoom"
          data-testid="pdp-gallery-zoom"
          style={
            zoomed
              ? {
                  transform: `scale(${ZOOM_SCALE})`,
                  transformOrigin: `${origin.x}% ${origin.y}%`,
                }
              : undefined
          }
        >
          <Image
            src={activeUrl}
            alt={activeAsset?.alt ?? name}
            fill
            priority={active === 0}
            sizes="(max-width: 768px) 100vw, 40vw"
            className="object-contain"
            draggable={false}
            {...(activeAsset?.blurDataURL
              ? { placeholder: 'blur' as const, blurDataURL: activeAsset.blurDataURL }
              : {})}
          />
        </div>

        {count > 1 && (
          <>
            {/* Screen-direction arrows: the one on the left goes to the next
                photo, matching ArrowLeft and a leftward swipe. */}
            <button
              type="button"
              className="pdp-gallery__nav pdp-gallery__nav--next"
              aria-label="התמונה הבאה"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => go(active + 1)}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pdp-gallery__nav pdp-gallery__nav--prev"
              aria-label="התמונה הקודמת"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => go(active - 1)}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
            <output className="pdp-gallery__counter" aria-live="polite" dir="rtl">
              {active + 1} / {count}
            </output>
          </>
        )}
      </section>

      {/* Thumbnails */}
      {count > 1 && (
        <div className="pdp-gallery__thumbs">
          {images.map((url, i) => (
            <button
              type="button"
              key={url}
              onClick={() => go(i)}
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
