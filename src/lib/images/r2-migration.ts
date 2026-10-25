/**
 * R2 Image Migration Utilities
 *
 * Helpers for migrating images from Supabase/existing sources to Cloudflare R2.
 * Once R2 is enabled and DNS configured, images can be batch-migrated.
 *
 * This is a placeholder for when R2 becomes available.
 */

import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { R2_CONFIG, isR2Enabled } from './optimizer'

export interface ImageMigrationStats {
  total: number
  successful: number
  failed: number
  errors: string[]
}

/**
 * Check if R2 is properly configured for migration.
 *
 * @returns true if R2 is enabled and has valid API credentials
 */
export function canMigrateToR2(): boolean {
  return isR2Enabled() && !!R2_CONFIG.apiToken && !!R2_CONFIG.accountId
}

/**
 * Upload an image to R2 bucket.
 *
 * Once R2 API token is configured, this will upload images directly.
 * Currently returns a placeholder response.
 *
 * @param imageUrl - Source image URL
 * @param targetPath - Target path in R2 bucket (e.g., 'products/sku123.jpg')
 * @returns Promise with upload result
 */
export async function uploadToR2(
  imageUrl: string,
  targetPath: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!canMigrateToR2()) {
    return {
      success: false,
      error: 'R2 not properly configured',
    }
  }

  try {
    // Placeholder: Fetch image from source
    const response = await fetchWithTimeout(imageUrl)
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch image: ${response.statusText}`,
      }
    }

    // When R2 API is integrated, use:
    // const buffer = await response.arrayBuffer()
    // const r2Response = await s3Client.putObject({
    //   Bucket: R2_CONFIG.bucketName,
    //   Key: targetPath,
    //   Body: buffer,
    //   ContentType: response.headers.get('content-type'),
    // })

    return {
      success: true,
      path: `${R2_CONFIG.publicDomain}/${targetPath}`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: message,
    }
  }
}

/**
 * Batch migrate product images to R2.
 *
 * Scans the database for product images and uploads them to R2.
 * Currently returns a placeholder response.
 *
 * @returns Migration statistics
 */
export async function migrateProductImagesToR2(): Promise<ImageMigrationStats> {
  const stats: ImageMigrationStats = {
    total: 0,
    successful: 0,
    failed: 0,
    errors: [],
  }

  if (!canMigrateToR2()) {
    stats.errors.push('R2 not properly configured')
    return stats
  }

  // NOTE: Deferred infrastructure task - R2 batch migration workflow
  // Steps to implement when R2 is enabled and credentials available:
  // - Query database for all product images
  // - Batch upload to R2
  // - Update product.images URLs to point to R2
  // - Verify uploads and delete from source

  return stats
}

/**
 * Generate R2 public URL from image path.
 *
 * @param imagePath - Path in R2 bucket (e.g., 'products/sku123.jpg')
 * @returns Full public URL
 */
export function getR2PublicUrl(imagePath: string): string {
  if (!isR2Enabled()) {
    return ''
  }

  return `${R2_CONFIG.publicDomain}/${imagePath}`
}
