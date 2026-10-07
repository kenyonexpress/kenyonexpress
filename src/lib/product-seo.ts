import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'

export type ProductSeoRow = {
  name_he: string | null
  description_he: string | null
  short_description_he: string | null
  seo_title: string | null
  seo_description: string | null
  images: unknown
  status: string | null
  deleted_at: string | null
}

/**
 * Catalogue fields `generateMetadata` needs on a PDP.
 *
 * Must stay on `createCatalogueReadClient` + `use cache`: the request-scoped client
 * reads cookies, which forces streaming metadata (description lands after the
 * first `</head>`, and Lighthouse SEO fails `meta-description` even when the
 * tag exists later in the document). Cached anon reads can resolve with the
 * shell so the description is in the initial head ([26]).
 */
export async function getProductSeoBySlug(slug: string): Promise<ProductSeoRow | null> {
  'use cache'
  cacheLife(CacheLife.product)
  cacheTag(CATALOGUE_TAG)
  const supabase = createCatalogueReadClient()
  const row = orFail(
    await supabase
      .from('products')
      .select(
        'id, name_he, description_he, short_description_he, seo_title, seo_description, images, status, deleted_at',
      )
      .eq('slug', slug)
      .maybeSingle(),
    'product_seo.read_failed',
    { slug },
  )
  // Per-product handle, keyed by id like the webhook that stales it.
  if (row) cacheTag(CacheTags.product(row.id))
  return row
}
