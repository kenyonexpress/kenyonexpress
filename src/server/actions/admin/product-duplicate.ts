'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireStaffSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'

/**
 * Duplicating a deal.
 *
 * WHAT MAKES THIS WORTH HAVING. A deal is a product row with something like
 * thirty columns on it - commission split, cashback percent, coupon price,
 * validity window, category, supplier - and running the same offer next month
 * means retyping all of them. The mistake that follows is not a typo in the
 * name; it is a `platform_percent` that was 70 last time and is 15 this time
 * because somebody re-entered it from memory, which is money.
 *
 * WHAT IS DELIBERATELY NOT COPIED, AND THIS IS THE WHOLE DESIGN:
 *
 *   status      -> always `draft`. A copy that arrived live would put an
 *                  unreviewed duplicate of a real offer on the storefront the
 *                  instant somebody clicked a button labelled "duplicate".
 *   slug        -> suffixed and made unique. The slug is the public URL, so a
 *                  copy sharing one either collides with the unique index or,
 *                  worse, silently takes over the original's address.
 *   sku         -> cleared. Two products with one SKU is a stock system that
 *                  cannot say which one was sold.
 *   stock       -> zero. Inherited stock is inventory that does not exist,
 *                  offered for sale.
 *   deleted_at  -> cleared, so duplicating an archived deal revives the OFFER
 *                  without reviving the archived row.
 *   id, timestamps -> the database's.
 *
 * Everything else is copied precisely because it is the part worth not
 * retyping.
 */

/** The columns a copy must NOT inherit, each for the reason above. */
const NOT_COPIED = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'slug',
  'sku',
  'status',
  'stock_quantity',
  'approval_status',
  'published_at',
])

export type DuplicateResult = { ok: true; id: string; slug: string } | { ok: false; error: string }

async function runDuplicateProduct(productId: string): Promise<DuplicateResult> {
  let session: Awaited<ReturnType<typeof requireStaffSession>>
  try {
    session = await requireStaffSession()
  } catch {
    return { ok: false, error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { data: original, error: readError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle()
  if (readError) {
    log.error('admin.product_duplicate_read_failed', { productId, reason: readError.message })
    return { ok: false, error: 'לא ניתן לטעון את המוצר' }
  }
  if (!original) return { ok: false, error: 'המוצר לא נמצא' }

  const source = original as unknown as Record<string, unknown>
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (!NOT_COPIED.has(key)) copy[key] = value
  }

  const baseSlug = typeof source.slug === 'string' ? source.slug : 'product'
  const baseName = typeof source.name_he === 'string' ? source.name_he : 'מוצר'

  copy.slug = await uniqueSlug(supabase, baseSlug)
  copy.name_he = `${baseName} (עותק)`.slice(0, 200)
  copy.status = 'draft'
  copy.stock_quantity = 0

  const { data: created, error: insertError } = await supabase
    .from('products')
    .insert(copy as never)
    .select('id, slug')
    .single()

  if (insertError || !created) {
    // 23505 means the slug raced another duplicate between the check and the
    // insert. Named, because "duplication failed" would have the operator click
    // again and hit the same race.
    if (insertError?.code === '23505') {
      return { ok: false, error: 'התנגשות בכתובת. נסו שוב.' }
    }
    log.error('admin.product_duplicate_failed', { productId, reason: insertError?.message })
    return { ok: false, error: 'שכפול המוצר נכשל' }
  }

  const row = created as { id: string; slug: string }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'products',
    entityId: row.id,
    metadata: { duplicated_from: productId, slug: row.slug },
  })

  revalidatePath('/admin/products')
  // The copy is a DRAFT and therefore not on the storefront, so strictly this
  // changes nothing public. Invalidated anyway: the catalogue query is what
  // decides what "not public" means, and a duplicate that turned out to be
  // visible would be a silent one.
  updateTag(CATALOGUE_TAG)

  return { ok: true, id: row.id, slug: row.slug }
}

/**
 * `slug-copy`, then `slug-copy-2`, and so on.
 *
 * Checked rather than assumed, because the catalogue already carries
 * `צימר-מאסטר-copy` AND `צימר-מאסטר-copy-copy` (`catalogue-known-issues.json`),
 * which is what appending blindly produces after the second time. Bounded at
 * twenty attempts: past that something is wrong that another query will not
 * fix, and an unbounded loop against the database is worse than a refusal.
 */
async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string,
): Promise<string> {
  const stem = base.replace(/-copy(-\d+)?$/, '')
  for (let attempt = 1; attempt <= 20; attempt++) {
    const candidate = attempt === 1 ? `${stem}-copy` : `${stem}-copy-${attempt}`
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('slug', candidate)
      .limit(1)
      .maybeSingle()
    // A failed check is not a free slug. Skipping to the next candidate is the
    // safe direction: the unique index is the real guard and a collision there
    // is reported to the operator rather than silently overwriting anything.
    if (error) continue
    if (!data) return candidate
  }
  return `${stem}-copy-${Date.now()}`
}

export async function duplicateProduct(productId: string): Promise<DuplicateResult> {
  return withActionContext('admin.product.duplicate', () => runDuplicateProduct(productId))
}
