'use client'

import { VARIANT_WIDTHS, pickVariantWidth, variantKey, variantSrcSet } from '@/lib/r2/variants'
import Image, { type ImageLoaderProps } from 'next/image'

type R2ImageProps = {
  /** Base key the variants were uploaded under, e.g. `products/<uuid>`. */
  baseKey: string
  /** Public CDN origin, e.g. https://cdn.kenyonexpress.co.il */
  publicBase: string
  alt: string
  width: number
  height: number
  sizes?: string
  priority?: boolean
  className?: string
}

/**
 * AVIF where the browser takes it, WebP everywhere else, from pre-built R2
 * variants. The fallback goes through next/image with a loader that picks the
 * nearest stored width, so there is no on-the-fly resize.
 */
export function R2Image({
  baseKey,
  publicBase,
  alt,
  width,
  height,
  sizes,
  priority,
  className,
}: R2ImageProps) {
  const base = publicBase.replace(/\/$/, '')
  const loader = ({ width: w }: ImageLoaderProps) =>
    `${base}/${variantKey(baseKey, pickVariantWidth(w), 'webp')}`

  return (
    <picture>
      <source
        type="image/avif"
        srcSet={variantSrcSet(base, baseKey, 'avif', VARIANT_WIDTHS)}
        sizes={sizes}
      />
      <Image
        loader={loader}
        src={baseKey}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        className={className}
      />
    </picture>
  )
}
