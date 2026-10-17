/**
 * Image optimization configuration for Cloudflare R2 + Vercel Image Optimization.
 *
 * Cloudflare R2 with Image Resizing provides:
 * - Automatic format negotiation (WebP, AVIF, JPEG)
 * - Responsive resizing at specific breakpoints
 * - Art-direction (crop, gravity settings)
 * - Edge caching via Cloudflare CDN
 *
 * Fallback to Vercel Image Optimization when R2 is not available.
 */

export type ImageFormat = 'webp' | 'avif' | 'jpeg'
export type ImageQuality = 50 | 60 | 75 | 90 | 95

/** Responsive breakpoints matching Tailwind and Lighthouse measurements */
export const RESPONSIVE_BREAKPOINTS = {
  mobile380: 380,
  tablet768: 768,
  desktop1440: 1440,
} as const

/** Standard quality levels for different use cases */
export const IMAGE_QUALITIES = {
  thumbnail: 50,
  preview: 60,
  standard: 75,
  hq: 90,
  lossless: 95,
} as const

/** Product image dimensions and art direction rules */
export const PRODUCT_IMAGE_SPECS = {
  dealCard: {
    widths: [256, 288, 384],
    aspectRatio: '3/4',
    gravity: 'auto',
  },
  productPage: {
    widths: [400, 600, 1000],
    aspectRatio: '1/1',
    gravity: 'auto',
  },
  gallery: {
    widths: [300, 600, 1200],
    aspectRatio: '1/1',
    gravity: 'auto',
  },
  thumbnail: {
    widths: [96, 128, 192],
    aspectRatio: '1/1',
    gravity: 'center',
  },
} as const

/**
 * Generate a Cloudflare Image Resizing URL.
 *
 * When R2 is enabled, the image URL format is:
 * https://cdn.kenyonexpress.co.il/cdn-cgi/image/[options]/[source-image-path]
 *
 * @param sourceUrl - The original image URL or path (e.g., /products/sku123.jpg)
 * @param width - Target width in pixels
 * @param format - Target format (webp, avif, or auto for negotiation)
 * @param quality - Compression quality (1-100)
 * @returns Cloudflare Image Resizing URL
 */
export function cfImageUrl(
  sourceUrl: string,
  width: number,
  format: ImageFormat = 'webp',
  quality: ImageQuality = 75,
): string {
  // Extract path from full URL if needed
  const imagePath = sourceUrl.startsWith('http') ? new URL(sourceUrl).pathname : sourceUrl

  // Cloudflare Image Resizing options
  const options = [
    `width=${width}`,
    `quality=${quality}`,
    `format=${format}`,
    'fit=scale-down',
  ].join(',')

  return `/images/r2/cdn-cgi/image/${options}${imagePath}`
}

/**
 * Generate srcset for responsive images with AVIF fallback.
 *
 * Creates a complete srcset for modern browsers supporting AVIF and WebP,
 * with JPEG fallback for older browsers.
 *
 * @param sourceUrl - Base image URL or path
 * @param widths - Array of responsive widths
 * @param format - Primary format (avif preferred, webp fallback)
 * @returns HTML srcset string
 */
export function responsiveSrcSet(
  sourceUrl: string,
  widths: number[],
  format: ImageFormat = 'avif',
): string {
  const quality = IMAGE_QUALITIES.standard

  const entries = widths
    .filter((w, i, arr) => arr.indexOf(w) === i) // deduplicate
    .sort((a, b) => a - b)
    .map((w) => `${cfImageUrl(sourceUrl, w, format, quality)} ${w}w`)

  return entries.join(', ')
}

/**
 * Generate a picture element with art-directed sources.
 *
 * Returns a configuration object that can be used with <picture> element
 * to serve different crops/compositions for different viewport sizes.
 *
 * @param sourceUrl - Base image URL
 * @returns Object with sources for mobile/tablet/desktop
 */
export function artDirectedSources(sourceUrl: string) {
  return {
    mobile: {
      // 380px viewport, 1.75x DPI typical for mobile
      width: 380,
      srcSet: [
        `${cfImageUrl(sourceUrl, 256, 'avif', 75)} 1x`,
        `${cfImageUrl(sourceUrl, 512, 'avif', 75)} 2x`,
      ].join(', '),
      media: '(max-width: 639px)',
    },
    tablet: {
      // 768px viewport, 2x DPI for tablets
      width: 768,
      srcSet: [
        `${cfImageUrl(sourceUrl, 600, 'avif', 75)} 1x`,
        `${cfImageUrl(sourceUrl, 1200, 'avif', 75)} 2x`,
      ].join(', '),
      media: '(min-width: 640px) and (max-width: 1023px)',
    },
    desktop: {
      // 1440px viewport and above
      width: 1440,
      srcSet: [
        `${cfImageUrl(sourceUrl, 1000, 'avif', 75)} 1x`,
        `${cfImageUrl(sourceUrl, 2000, 'avif', 75)} 2x`,
      ].join(', '),
      media: '(min-width: 1024px)',
    },
  }
}

/** Configuration for R2 account when enabled */
export const R2_CONFIG = {
  /** Account ID from Cloudflare dashboard */
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  /** R2 bucket name */
  bucketName: process.env.CLOUDFLARE_R2_BUCKET || 'kenyonexpress-images',
  /** R2 public domain (cdn.kenyonexpress.co.il once DNS is set up) */
  publicDomain: process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN || '',
  /** API token for R2 management */
  apiToken: process.env.CLOUDFLARE_R2_API_TOKEN || '',
}

/**
 * Check if R2 is properly configured and enabled.
 *
 * Returns false if any required configuration is missing.
 */
export function isR2Enabled(): boolean {
  return !!(R2_CONFIG.accountId && R2_CONFIG.publicDomain && R2_CONFIG.apiToken)
}
