/**
 * Custom Next.js Image Loader for Cloudflare R2 with fallback to Vercel optimizer.
 *
 * When R2 is enabled, images are served through Cloudflare's Image Resizing API.
 * Otherwise, falls back to Vercel's standard image optimization.
 *
 * Usage in next.config.ts:
 *   images: {
 *     loader: 'custom',
 *     loaderFile: './src/lib/images/loader.ts',
 *   }
 */

import type { ImageLoaderProps } from 'next/image'
import { cfImageUrl, isR2Enabled } from './optimizer'

/**
 * Next.js image loader function.
 *
 * Called by next/image component to generate the optimized image URL.
 * Maps the loader props to either Cloudflare R2 or Vercel optimization.
 *
 * @param params - Loader parameters from next/image
 * @returns Optimized image URL
 */
export default function imageLoader({ src, width, quality = 75 }: ImageLoaderProps): string {
  // If src is already a local path or data URL, use as-is
  if (src.startsWith('/') || src.startsWith('data:')) {
    // For local paths, use Vercel's default optimization
    return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`
  }

  // If R2 is enabled, use Cloudflare Image Resizing
  if (isR2Enabled()) {
    try {
      return cfImageUrl(src, width, 'avif', quality as unknown as number as 50 | 60 | 75 | 90 | 95)
    } catch {
      // Fall back to Vercel on error
    }
  }

  // Default to Vercel's image optimization
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`
}
