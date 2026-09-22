'use server'

/**
 * DELIBERATE CACHE-INVALIDATION EXCEPTION (scripts/cache-invalidation-scan.mjs).
 *
 * Neither write below touches anything a CATALOGUE_TAG-cached read selects:
 * no cached query reads suppliers.feed_url/feed_format, and deal_candidates
 * has no cached reader in any status, approved included. Turning an approved
 * candidate into a public.products row is a separate, later admin action
 * (not built yet -- see docs/DEALS-PIPELINE.md), and THAT path is where
 * updateTag(CATALOGUE_TAG) belongs. Calling it here would flush the whole
 * catalogue cache on every feed-config save and every manual submission to
 * publish nothing a shopper can see.
 */

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])

export type FeedConfigState = { ok: boolean; message?: string; error?: string }

/**
 * A supplier points the deals pipeline at their own feed, or clears it.
 *
 * Written with the ADMIN client on purpose, the same way every other field
 * on `suppliers` a supplier is allowed to touch is written
 * (src/app/(supplier)/supplier/settings/page.tsx's own note on why: an RLS
 * UPDATE policy is a grant on the whole row, and Postgres RLS cannot scope
 * an UPDATE to two columns on its own). This action is the column scope:
 * it writes feed_url and feed_format and nothing else on the row, after
 * `requireSupplierRole('owner', ...)` has confirmed which supplier this
 * session may touch at all.
 */
const feedConfigSchema = z.object({
  feed_url: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || v.startsWith('https://'), 'הכתובת חייבת להתחיל ב-https://'),
  feed_format: z.enum(['json', 'csv']).nullable(),
})

async function runUpdateFeedConfig(formData: FormData): Promise<FeedConfigState> {
  const session = await requireSupplierRole('owner', '/supplier/settings')

  const parsed = feedConfigSchema.safeParse({
    feed_url: formData.get('feed_url') || undefined,
    feed_format: formData.get('feed_format') || null,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  // A feed with no URL has nothing to run against; a URL with no declared
  // format cannot be parsed. Either both are set or both are cleared.
  const { feed_url, feed_format } = parsed.data
  if (feed_url && !feed_format) {
    return { ok: false, error: 'יש לבחור פורמט (JSON או CSV) עבור הפיד' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('suppliers')
    .update({ feed_url, feed_format: feed_url ? feed_format : null })
    .eq('id', session.supplierId)

  if (error) {
    log.error('supplier.deals_feed_update_failed', {
      supplierId: session.supplierId,
      reason: error.message,
    })
    return { ok: false, error: 'שמירת הפיד נכשלה.' }
  }

  revalidatePath('/supplier/settings')
  return { ok: true, message: 'הפיד נשמר.' }
}

export async function updateFeedConfig(formData: FormData): Promise<FeedConfigState> {
  return withActionContext('supplier.deals_feed.update', () => runUpdateFeedConfig(formData))
}

/**
 * A supplier submits one deal by hand, with no feed at all.
 *
 * Written through the SUPPLIER'S OWN session (createClient(), not the admin
 * client): migration 237's `deal_candidates_supplier_manual_insert` RLS
 * policy is the actual gate here (source = 'manual', status =
 * 'pending_review', and the row's supplier_id must be one this session is
 * an active member of), so there is nothing this action needs to re-check
 * that the database will not already refuse.
 */
const manualDealSchema = z.object({
  name_he: z.string().trim().min(1, 'יש להזין שם').max(300),
  price_ils: z.coerce.number().positive('המחיר חייב להיות חיובי'),
  full_price_ils: z.coerce.number().positive().optional(),
  category_text: z.string().trim().max(200).optional(),
  link_url: z
    .string()
    .trim()
    .min(1, 'יש להזין קישור')
    .refine((v) => v.startsWith('https://'), 'הקישור חייב להתחיל ב-https://'),
  image_url: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || v.startsWith('https://'), 'כתובת התמונה חייבת להתחיל ב-https://'),
})

export type ManualDealState = { ok: boolean; message?: string; error?: string }

async function runSubmitManualDeal(formData: FormData): Promise<ManualDealState> {
  const session = await requireSupplierRole('owner', '/supplier/settings')

  const parsed = manualDealSchema.safeParse({
    name_he: formData.get('name_he'),
    price_ils: formData.get('price_ils'),
    full_price_ils: formData.get('full_price_ils') || undefined,
    category_text: formData.get('category_text') || undefined,
    link_url: formData.get('link_url'),
    image_url: formData.get('image_url') || undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const priceAgorot = Math.round(parsed.data.price_ils * 100)
  const fullPriceAgorot = parsed.data.full_price_ils
    ? Math.round(parsed.data.full_price_ils * 100)
    : null

  const supabase = await createClient()
  const { error } = await supabase.from('deal_candidates' as never).insert({
    supplier_id: session.supplierId,
    source: 'manual',
    // No feed, so no feed-supplied id. Unique enough for one supplier's
    // manual submissions without needing a second identifier scheme.
    external_ref: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    name_he: parsed.data.name_he,
    price_agorot: priceAgorot,
    full_price_agorot: fullPriceAgorot && fullPriceAgorot > priceAgorot ? fullPriceAgorot : null,
    category_text: parsed.data.category_text ?? null,
    link_url: parsed.data.link_url,
    image_url: parsed.data.image_url || null,
    raw_payload: {},
    status: 'pending_review',
  } as never)

  if (error) {
    if (TABLE_ABSENT.has(error.code ?? '')) {
      return { ok: false, error: 'הגשת דילים עדיין לא זמינה.' }
    }
    log.error('supplier.manual_deal_submit_failed', {
      supplierId: session.supplierId,
      reason: error.message,
    })
    return { ok: false, error: 'השליחה נכשלה.' }
  }

  revalidatePath('/supplier/settings')
  return { ok: true, message: 'הדיל נשלח לאישור.' }
}

export async function submitManualDeal(formData: FormData): Promise<ManualDealState> {
  return withActionContext('supplier.manual_deal.submit', () => runSubmitManualDeal(formData))
}
