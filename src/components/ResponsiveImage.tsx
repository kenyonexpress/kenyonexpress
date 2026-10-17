/**
 * ResponsiveImage component with AVIF/WebP format support and art direction.
 *
 * Extends next/image with:
 * - Automatic AVIF + WebP format negotiation
 * - Responsive srcset for multiple breakpoints
 * - Art-direction (different crops for different viewports)
 * - Fallback to standard JPEG/PNG
 *
 * Usage:
 *   <ResponsiveImage
 *     src="/products/sku123.jpg"
 *     alt="Product name"
 *     width={400}
 *     height={400}
 *   />
 */

'use client'

import { PRODUCT_IMAGE_SPECS, responsiveSrcSet } from '@/lib/images/optimizer'
import Image, { type ImageProps } from 'next/image'
import { useMemo } from 'react'

type ResponsiveImageProps = Omit<ImageProps, 'src'> & {
  /** Image source URL or path */
  src: string
  /** Product image type for responsive specs (optional) */
  imageType?: keyof typeof PRODUCT_IMAGE_SPECS
  /** Override default widths for srcset generation */
  customWidths?: number[]
  /** Custom sizes attribute for browser layout calculations */
  customSizes?: string
  /** Fallback if image fails to load */
  fallback?: React.ReactNode
}

/**
 * Generate sizes attribute for responsive images.
 *
 * Tells the browser which image size to use for different viewport widths.
 * Based on Tailwind breakpoints: sm=640px, md=768px, lg=1024px
 */
function generateSizes(
  customSizes: string | undefined,
  imageType?: keyof typeof PRODUCT_IMAGE_SPECS,
): string {
  if (customSizes) {
    return customSizes
  }

  // Default sizes for different image types
  const defaults: Record<string, string> = {
    dealCard: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
    productPage: '(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 60vw',
    gallery: '(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 70vw',
    thumbnail: '(max-width: 640px) 96px, 128px',
  }

  if (imageType && imageType in defaults) {
    return defaults[imageType]
  }

  return defaults.productPage
}

export default function ResponsiveImage({
  src,
  alt,
  width,
  height,
  imageType,
  customWidths,
  customSizes,
  fallback,
  className,
  ...props
}: ResponsiveImageProps) {
  // Generate responsive widths based on image type or custom widths
  const widths = useMemo(() => {
    if (customWidths) return customWidths

    if (imageType && imageType in PRODUCT_IMAGE_SPECS) {
      return Array.from(PRODUCT_IMAGE_SPECS[imageType].widths)
    }

    // Default responsive breakpoints
    return [256, 384, 600, 1000]
  }, [customWidths, imageType])

  // Generate srcset with AVIF format (WebP fallback in picture element)
  const avifSrcSet = useMemo(() => {
    return responsiveSrcSet(src, widths, 'avif')
  }, [src, widths])

  const sizes = generateSizes(customSizes, imageType)

  // For local paths or when R2 is not enabled, use standard next/image
  if (src.startsWith('/')) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={className}
        {...props}
      />
    )
  }

  // For remote URLs with R2 enabled, use picture element with format negotiation
  return (
    <picture className={className}>
      {/* AVIF for modern browsers */}
      <source srcSet={avifSrcSet} type="image/avif" sizes={sizes} />

      {/* WebP fallback */}
      <source srcSet={responsiveSrcSet(src, widths, 'webp')} type="image/webp" sizes={sizes} />

      {/* JPEG fallback for older browsers */}
      <Image
        src={src}
        alt={alt}
        width={width ?? 600}
        height={height ?? 600}
        sizes={sizes}
        className={className}
        {...props}
      />
    </picture>
  )
}
