import { orFail } from '@/lib/catalogue-read'
import { createPublicClient } from '@/lib/supabase/anon'

export type GalleryAsset = {
  alt: string | null
  blurDataURL: string | null
}

/**
 * Load blur placeholders and Hebrew alt text for a set of product images.
 * Fetches from media_assets table keyed by image URL.
 */
export async function loadGalleryAssets(images: string[]): Promise<Record<string, GalleryAsset>> {
  if (images.length === 0) return {}

  const data = orFail(
    await createPublicClient()
      .from('media_assets')
      .select('url, alt_he, blur_data_url')
      .in('url', images),
    'gallery_assets_failed',
    { image_count: images.length },
  )

  return Object.fromEntries(
    (data ?? []).map((a) => [a.url, { alt: a.alt_he, blurDataURL: a.blur_data_url }]),
  )
}

/**
 * Collect all unique image URLs from products, then load their blur data in one query.
 * Returns a flat map: imageUrl -> { alt, blurDataURL }
 */
export async function loadGalleryAssetsForProducts<T extends { images: unknown }>(
  products: T[],
): Promise<Record<string, GalleryAsset>> {
  const uniqueUrls = new Set<string>()

  for (const product of products) {
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (typeof img === 'string') {
          uniqueUrls.add(img)
        }
      }
    }
  }

  return loadGalleryAssets(Array.from(uniqueUrls))
}
