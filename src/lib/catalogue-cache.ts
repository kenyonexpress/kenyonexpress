import { revalidatePath } from 'next/cache'

/**
 * Storefront catalogue cache contract.
 *
 * Public product/category/home routes use ISR (`export const revalidate`).
 * Every admin write that changes what a shopper sees must call
 * `revalidateStorefrontCatalogue` so the next request is not stuck on a stale
 * ISR page for the full revalidate window.
 *
 * Stock decrements in finalize intentionally do NOT invalidate the whole
 * catalogue (see ARCHITECTURE-SEO-PERFORMANCE): cart/checkout re-read stock live.
 */

export const CATALOGUE_TAG = 'catalogue'

/** Invalidate ISR HTML for catalogue surfaces after an admin catalogue write. */
export function revalidateStorefrontCatalogue(opts?: {
  productSlug?: string | null
  categorySlug?: string | null
}) {
  revalidatePath('/')
  revalidatePath('/products')
  revalidatePath('/coupons')
  revalidatePath('/sitemap.xml')
  if (opts?.productSlug) {
    revalidatePath(`/product/${opts.productSlug}`)
  }
  if (opts?.categorySlug) {
    revalidatePath(`/category/${opts.categorySlug}`)
  }
}
