'use server'

import { productSchema as schema, variantSchema } from '@/lib/admin/product-form-schema'
import { variantIdsToRemove } from '@/lib/admin/product-variants'
import { requireStaffSession } from '@/lib/admin/rbac'
import { applyUploaderPolicy } from '@/lib/admin/uploader-policy'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { ilsToAgorot } from '@/lib/commerce/money'
import { assertPublishable, buildProductMoneyWrite } from '@/lib/commerce/product-money'
import { recurringSchemaError } from '@/lib/commerce/recurring-schema-error'
import { whatsappSchemaError } from '@/lib/commerce/whatsapp-schema-error'
import { IMAGE_HOST_ERROR, isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

export type ProductFormState = { error: string } | { success: string } | null

async function runUpsertProduct(
  _: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  let session: Awaited<ReturnType<typeof requireStaffSession>>
  try {
    session = await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = schema.safeParse({
    id: formData.get('id') || undefined,
    supplier_id: formData.get('supplier_id') || null,
    category_id: formData.get('category_id') || null,
    slug: formData.get('slug'),
    name_he: formData.get('name_he'),
    name_en: formData.get('name_en') || null,
    description_he: formData.get('description_he') || null,
    type: formData.get('type'),
    kenyon_price: formData.get('kenyon_price'),
    full_price: formData.get('full_price') || null,
    platform_percent: formData.get('platform_percent'),
    supplier_split_percent: formData.get('supplier_split_percent') || null,
    discount_percent: formData.get('discount_percent') || null,
    coupon_price_ils: formData.get('coupon_price_ils') || null,
    coupon_expiry_days: formData.get('coupon_expiry_days') || null,
    offer_valid_until: formData.get('offer_valid_until') || null,
    is_coupon_enabled: formData.get('is_coupon_enabled') === 'true',
    sku: formData.get('sku') || null,
    stock_quantity: formData.get('stock_quantity') || null,
    is_featured: formData.get('is_featured') === 'true',
    status: formData.get('status'),
    short_description_he: formData.get('short_description_he') || null,
    brand: formData.get('brand') || null,
    // one highlight per line from the textarea
    highlights: String(formData.get('highlights') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    video_url: formData.get('video_url') || null,
    barcode: formData.get('barcode') || null,
    low_stock_threshold: formData.get('low_stock_threshold') || 5,
    max_per_order: formData.get('max_per_order') || null,
    requires_shipping: formData.get('requires_shipping') === 'true',
    whatsapp_enabled: formData.get('whatsapp_enabled') === 'true',
    weight_grams: formData.get('weight_grams') || null,
    length_mm: formData.get('length_mm') || null,
    width_mm: formData.get('width_mm') || null,
    height_mm: formData.get('height_mm') || null,
    vat_exempt: formData.get('vat_exempt') === 'true',
    // One text input, comma separated. Split here rather than in the form so
    // the server decides what a tag is: trimmed, non-empty, and deduped, so
    // "מבצע, מבצע" is one tag and a trailing comma is not an empty one.
    tags: [
      ...new Set(
        String(formData.get('tags') ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ],
    warranty_months: formData.get('warranty_months') || null,
    condition: formData.get('condition') || null,
    coupon_terms_he: formData.get('coupon_terms_he') || null,
    redemption_instructions_he: formData.get('redemption_instructions_he') || null,
    min_purchase_ils: formData.get('min_purchase_ils') || null,
    seo_title: formData.get('seo_title') || null,
    seo_description: formData.get('seo_description') || null,
    seo_keywords: formData.get('seo_keywords') || null,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  /**
   * Every entry is validated, and it is the only one of the four image write
   * paths that had NO validation at all: the field arrives as a JSON string and
   * went to the column unread.
   *
   * These strings are rendered by next/image on the deal cards, the homepage
   * and the product page. next THROWS on a host that is not in
   * `images.remotePatterns`, so one pasted URL from an un-allowlisted host is a
   * 500 on the storefront, written from the admin, with nothing failing at the
   * moment it is saved. Measured against production before this landed: 76
   * entries, 27 local paths and 45 picsum, all of them allowed, so no existing
   * row becomes uneditable.
   */
  const imagesRaw = formData.get('images') as string | null
  let images: unknown[] = []
  if (imagesRaw) {
    try {
      const parsedImages = JSON.parse(imagesRaw)
      if (!Array.isArray(parsedImages)) return { error: 'רשימת התמונות אינה תקינה' }
      images = parsedImages
    } catch {
      return { error: 'רשימת התמונות אינה תקינה' }
    }
    const badImage = images.find((v) => typeof v !== 'string' || !isAllowedImageUrl(v))
    if (badImage !== undefined) return { error: IMAGE_HOST_ERROR }
  }

  const variantsRaw = formData.get('variants') as string | null
  const variantsParsed = variantsRaw
    ? (JSON.parse(variantsRaw) as unknown[]).map((v) => variantSchema.safeParse(v))
    : []

  const invalidVariant = variantsParsed.find((v) => !v.success)
  if (invalidVariant && !invalidVariant.success) {
    return { error: `גרסה לא תקינה: ${invalidVariant.error.issues[0]?.message}` }
  }

  const variants = variantsParsed.filter((v) => v.success).map((v) => v.data)

  /**
   * The three recurring inputs leave `fields` here and never reach the row
   * spread. `recurring_amount_ils` is not a column at any point - the column is
   * `recurring_amount_agorot` - and the other two arrive on the row only via
   * `money.fields`, which omits them entirely unless the type is recurring.
   *
   * This is what keeps 135 optional for every other product: a physical
   * save sends no column that the un-migrated database has never heard of.
   */
  const {
    id,
    recurring_amount_ils: recurringAmountIls,
    billing_interval: billingInterval,
    billing_interval_count: billingIntervalCount,
    whatsapp_enabled: whatsappEnabled,
    ...fields
  } = parsed.data

  /**
   * The row always carries `whatsapp_enabled`; the WRITE drops it if the column
   * turns out not to exist yet.
   *
   * The column arrives with `migrations/pending/123_products_whatsapp_enabled
   * .sql`, which is not applied. Three cheaper-looking options were rejected:
   *
   *  - Always send it. PostgREST answers PGRST204 for EVERY product an admin
   *    edits: the whole admin broken by a feature nobody switched on.
   *  - Send it only when ticked. Then un-ticking a previously ticked box sends
   *    nothing and the flag silently stays on -- the one direction that matters,
   *    because it is how a supplier withdraws consent.
   *  - Read the row first to see whether it has the column. An extra round trip
   *    on every save, and the read itself fails on the un-migrated database.
   *
   * So the write is attempted with the column and retried without it, once,
   * only on the missing-column error. On a migrated database there is no retry
   * and no extra call. On an un-migrated one an untouched toggle costs one
   * retry and saves correctly, while a DELIBERATELY ticked box is reported
   * through `whatsappSchemaError` with the filename, rather than being written
   * nowhere and reported as success.
   */
  const whatsappFields = { whatsapp_enabled: whatsappEnabled }

  async function writeWithWhatsAppFallback<T>(
    run: (
      extra: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: PostgrestError | null }>,
  ) {
    const first = await run(whatsappFields)
    if (!first.error) return first

    // Only the missing-column case is retried, and only when the admin did not
    // ask for the feature. Anything else is a real error and must surface.
    if (whatsappEnabled || whatsappSchemaError(first.error.message) === null) return first
    return run({})
  }

  // Shekels to agorot, once, at the edge, through money.ts. Nothing downstream
  // ever sees a float on this path.
  const recurringAmountAgorot =
    fields.type === 'recurring' && recurringAmountIls != null
      ? ilsToAgorot(recurringAmountIls.toFixed(2))
      : null

  // Every money column this write must set, derived once by the same pure
  // module the form preview and checkout use.
  const money = buildProductMoneyWrite({
    type: fields.type,
    kenyonPrice: fields.kenyon_price,
    platformPercent: fields.platform_percent,
    supplierSplitPercent: fields.supplier_split_percent,
    discountPercent: fields.discount_percent,
    couponPriceIls: fields.coupon_price_ils,
    couponExpiryDays: fields.coupon_expiry_days,
    recurringAmountAgorot,
    billingInterval,
    billingIntervalCount: billingIntervalCount ?? 1,
  })
  if (!money.ok) return { error: money.message }

  // The uploader money boundary + forced pending approval (see the policy
  // module for the full why; until 2026-09-02 an uploader could type any
  // commission percent straight into a live, auto-approved product).
  const policy = applyUploaderPolicy(
    session.role,
    money.fields as unknown as Record<string, unknown>,
  )
  const moneyWrite = policy.fields
  const isUploader = policy.forcePendingApproval

  if (fields.status === 'active') {
    // Publishing needs a complete supplier, so the identity is loaded rather
    // than assumed. Service role: this is a staff read of a table with no
    // permissive select policy for `authenticated`.
    const adminClient = createAdminClient()
    const { data: supplier } = fields.supplier_id
      ? await adminClient
          .from('suppliers')
          .select('id, name, contact_phone, address, logo_url, status')
          .eq('id', fields.supplier_id)
          .single()
      : { data: null }

    const gate = assertPublishable({
      type: fields.type,
      priceIls: money.fields.price_ils,
      platformPercent: money.fields.platform_percent,
      supplierSplitPercent: money.fields.supplier_split_percent,
      discountPercent: money.fields.discount_percent,
      couponPriceIls: money.fields.coupon_price_ils,
      couponExpiryDays: money.fields.coupon_expiry_days,
      recurringAmountAgorot,
      billingInterval,
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            phone: supplier.contact_phone,
            address: supplier.address,
            logoUrl: supplier.logo_url,
            status: supplier.status,
          }
        : { id: fields.supplier_id },
    })
    // Every failing reason at once. An admin filling in a product should not
    // have to submit six times to discover six missing fields (section 3.4).
    if (!gate.ok) {
      return { error: gate.blockers.map((b) => b.message).join(' · ') }
    }
  }

  let productId = id

  if (id) {
    const { error } = await writeWithWhatsAppFallback(async (extra) =>
      supabase
        .from('products')
        .update({
          ...fields,
          ...moneyWrite,
          ...extra,
          images,
          ...(isUploader ? { approval_status: 'pending' } : {}),
        })
        .eq('id', id)
        .select('id')
        .maybeSingle(),
    )
    if (error) {
      return {
        error:
          whatsappSchemaError(error.message) ??
          recurringSchemaError(error.message) ??
          error.message,
      }
    }
  } else {
    const { data, error } = await writeWithWhatsAppFallback<{ id: string }>(async (extra) =>
      supabase
        .from('products')
        .insert({
          ...fields,
          ...moneyWrite,
          ...extra,
          images,
          created_by: user!.id,
          ...(isUploader ? { approval_status: 'pending' } : {}),
        })
        .select('id')
        .single(),
    )
    if (error || !data) {
      return {
        error:
          whatsappSchemaError(error?.message) ??
          recurringSchemaError(error?.message) ??
          error?.message ??
          'שמירת המוצר נכשלה',
      }
    }
    productId = data.id
  }

  // Soft-delete variants removed in the editor (edit flow only). New products
  // have no existing variants to reconcile.
  if (id) {
    const { data: existing } = await supabase
      .from('product_variants')
      .select('id')
      .eq('product_id', id)
      .is('deleted_at', null)
    const toRemove = variantIdsToRemove(
      (existing ?? []).map((e) => e.id),
      variants.map((v) => v.id),
    )
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('product_variants')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .in('id', toRemove)
      if (error) return { error: error.message }
    }
  }

  if (variants.length > 0 && productId) {
    for (const v of variants) {
      const { id: vid, ...vfields } = v
      if (vid) {
        await supabase.from('product_variants').update(vfields).eq('id', vid)
      } else {
        await supabase.from('product_variants').insert({ ...vfields, product_id: productId })
      }
    }
  }

  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  redirect('/admin/products')
}

async function runDeleteProduct(id: string): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  return {}
}

async function runBulkUpdateProductStatus(
  ids: string[],
  status: 'draft' | 'active' | 'paused' | 'archived',
): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('products').update({ status }).in('id', ids)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  return {}
}

async function runBulkAssignCategory(
  ids: string[],
  categoryId: string | null,
): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (ids.length === 0) return { error: 'לא נבחרו מוצרים' }
  if (categoryId != null && !z.string().uuid().safeParse(categoryId).success) {
    return { error: 'קטגוריה לא תקינה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ category_id: categoryId })
    .in('id', ids)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  return {}
}

const bulkPriceSchema = z.discriminatedUnion('mode', [
  // percent: -90..500, applied to kenyon_price AND full_price so the
  // displayed discount ratio survives the adjustment
  z.object({ mode: z.literal('percent'), value: z.coerce.number().min(-90).max(500) }),
  // set: absolute kenyon_price in ILS
  z.object({ mode: z.literal('set'), value: z.coerce.number().min(0.01) }),
])

export type BulkPriceInput = z.infer<typeof bulkPriceSchema>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Bulk price update. Percent mode scales kenyon_price and full_price together;
 * set mode writes kenyon_price and skips products whose full_price would fall
 * below it (those are reported back, not silently broken).
 */
async function runBulkAdjustPrices(
  ids: string[],
  input: BulkPriceInput,
): Promise<{ error?: string; updated?: number; skipped?: string[] }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (ids.length === 0) return { error: 'לא נבחרו מוצרים' }

  const parsed = bulkPriceSchema.safeParse(input)
  if (!parsed.success) return { error: 'ערך מחיר לא תקין' }

  const supabase = await createClient()
  const { data: products, error: loadError } = await supabase
    .from('products')
    .select('id, name_he, kenyon_price, full_price')
    .in('id', ids)
  if (loadError) return { error: loadError.message }

  let updated = 0
  const skipped: string[] = []

  for (const p of products ?? []) {
    const current = Number(p.kenyon_price ?? 0)
    if (parsed.data.mode === 'percent') {
      const factor = 1 + parsed.data.value / 100
      const patch: { kenyon_price: number; full_price?: number } = {
        kenyon_price: round2(current * factor),
      }
      if (p.full_price != null) patch.full_price = round2(Number(p.full_price) * factor)
      const { error } = await supabase.from('products').update(patch).eq('id', p.id)
      if (error) return { error: error.message, updated }
      updated += 1
    } else {
      const next = round2(parsed.data.value)
      if (p.full_price != null && Number(p.full_price) < next) {
        skipped.push(p.name_he)
        continue
      }
      const { error } = await supabase
        .from('products')
        .update({ kenyon_price: next })
        .eq('id', p.id)
      if (error) return { error: error.message, updated }
      updated += 1
    }
  }

  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  return { updated, skipped }
}

async function runBulkSoftDeleteProducts(ids: string[]): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (ids.length === 0) return { error: 'לא נבחרו מוצרים' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .in('id', ids)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  return {}
}

async function runDeleteVariant(id: string): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('product_variants')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
  if (error) return { error: error.message }

  return {}
}

export async function upsertProduct(
  _: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  return withActionContext('admin.product.upsert', () => runUpsertProduct(_, formData))
}

export async function deleteProduct(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.product.delete', () => runDeleteProduct(id))
}

export async function bulkUpdateProductStatus(
  ids: string[],
  status: 'draft' | 'active' | 'paused' | 'archived',
): Promise<{ error?: string }> {
  return withActionContext('admin.product.bulk_update_status', () =>
    runBulkUpdateProductStatus(ids, status),
  )
}

export async function bulkAssignCategory(
  ids: string[],
  categoryId: string | null,
): Promise<{ error?: string }> {
  return withActionContext('admin.product.bulk_assign_category', () =>
    runBulkAssignCategory(ids, categoryId),
  )
}

export async function bulkAdjustPrices(
  ids: string[],
  input: BulkPriceInput,
): Promise<{ error?: string; updated?: number; skipped?: string[] }> {
  return withActionContext('admin.product.bulk_adjust_prices', () =>
    runBulkAdjustPrices(ids, input),
  )
}

export async function bulkSoftDeleteProducts(ids: string[]): Promise<{ error?: string }> {
  return withActionContext('admin.product.bulk_soft_delete', () => runBulkSoftDeleteProducts(ids))
}

export async function deleteVariant(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.variant.delete', () => runDeleteVariant(id))
}
