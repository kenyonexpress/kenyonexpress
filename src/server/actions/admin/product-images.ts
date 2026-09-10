'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import {
  type ImageMatchResult,
  type MatchableProduct,
  matchImagesToProducts,
} from '@/lib/admin/image-matching'
import { requireStaffSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'

export type BulkImageEntry = { filename: string; url: string }

export type BulkImageState =
  | { error: string }
  | { success: string; result: ImageMatchResult; attached: number }
  | null

/** Never trusts a client-supplied filename to be a path. */
const MAX_ENTRIES = 200

/**
 * Attaches already-uploaded images to products by matching filename to SKU,
 * falling back to slug.
 *
 * =========================================================================
 * IT TAKES URLS, IT DOES NOT UPLOAD
 * =========================================================================
 *
 * The upload is `ImageUploader`'s job and already works: it compresses in the
 * browser, puts the file in the `product-images` bucket and hands back a URL.
 * Rebuilding that here to own the whole flow would be a second upload path to
 * keep in step with the first, and the first is the one the product form uses.
 *
 * =========================================================================
 * IT APPENDS AND DOES NOT REPLACE
 * =========================================================================
 *
 * A product's existing images are kept and the matched one is added. Replacing
 * would make a mis-named file destroy a gallery somebody curated, and the undo
 * would be the only way back - which is a bad thing to depend on for the
 * ordinary case of an operator dragging in the wrong folder.
 *
 * =========================================================================
 * AUDITED WITH before/after, BUT NOT MARKED bulk_operation
 * =========================================================================
 *
 * The row records the `images` array either side, so the change is fully
 * answerable. It deliberately carries NO `bulk_operation` marker, so
 * `rollbackLastBulkOperation` does not treat it as the next thing to undo.
 *
 * That is not an oversight, it is the column type. `planRollback` compares and
 * restores SCALARS (`kenyon_price`, `status`, `category_id`) with `===`, and
 * `images` is a jsonb array: two equal arrays are never `===`, so every product
 * would be reported as "changed since", and if the comparison were loosened the
 * restore would write the array back through a path that has never handled one.
 * Undoing an image attach is also a different and simpler operation - remove
 * the URL that was added - rather than a restore of previous state.
 */
async function runBulkAttachImages(entries: BulkImageEntry[]): Promise<BulkImageState> {
  let session: Awaited<ReturnType<typeof requireStaffSession>>
  try {
    session = await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  if (entries.length === 0) return { error: 'לא נבחרו קבצים' }
  if (entries.length > MAX_ENTRIES) return { error: `עד ${MAX_ENTRIES} קבצים בכל פעם` }

  // Same allowlist the product form enforces. `images` is rendered by
  // next/image, whose `remotePatterns` reject an un-allowlisted host at render
  // time - so an unchecked URL here is a product page that throws rather than a
  // product page with a bad picture.
  const badUrl = entries.find((entry) => !isAllowedImageUrl(entry.url))
  if (badUrl) return { error: `כתובת תמונה לא מורשית: ${badUrl.filename}` }

  const supabase = await createClient()
  const { data: rows, error: loadError } = await supabase
    .from('products')
    .select('id, slug, sku, name_he, images')
    .is('deleted_at', null)

  if (loadError) {
    log.error('admin.bulk_images_load_failed', { reason: loadError.message })
    return { error: loadError.message }
  }

  const products = (rows ?? []) as unknown as {
    id: string
    slug: string
    sku: string | null
    name_he: string | null
    images: unknown
  }[]

  const matchable: MatchableProduct[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    nameHe: p.name_he,
  }))

  const result = matchImagesToProducts(
    entries.map((entry) => entry.filename),
    matchable,
  )

  const urlByFilename = new Map(entries.map((entry) => [entry.filename, entry.url]))
  const productById = new Map(products.map((p) => [p.id, p]))

  const before: { id: string; images: string[] }[] = []
  const after: { id: string; images: string[] }[] = []
  let attached = 0

  for (const match of result.matched) {
    const product = productById.get(match.productId)
    const url = urlByFilename.get(match.filename)
    if (!product || !url) continue

    const existing = Array.isArray(product.images) ? (product.images as string[]) : []
    // Already there is not a failure and not a second copy.
    if (existing.includes(url)) continue
    const next = [...existing, url]

    const { error } = await supabase.from('products').update({ images: next }).eq('id', product.id)
    if (error) {
      log.error('admin.bulk_images_update_failed', { productId: product.id, reason: error.message })
      return { error: error.message }
    }

    before.push({ id: product.id, images: existing })
    after.push({ id: product.id, images: next })
    attached += 1
  }

  if (attached > 0) {
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'updated',
      entityType: 'products',
      changes: {
        attached,
        matched: result.matched.length,
        problems: result.problems,
      },
      // No `bulk_operation` marker: see the note on this function.
      metadata: { source: 'bulk_attach_images' },
      before,
      after,
    })

    revalidatePath('/admin/products')
    updateTag(CATALOGUE_TAG)
  }

  return {
    success: `${attached} תמונות שויכו, ${result.problems.length} קבצים לא שויכו.`,
    result,
    attached,
  }
}

export async function bulkAttachImages(entries: BulkImageEntry[]): Promise<BulkImageState> {
  return withActionContext('admin.product.bulk_attach_images', () => runBulkAttachImages(entries))
}
