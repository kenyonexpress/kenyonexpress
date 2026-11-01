'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { giftCardProductRefusal } from '@/lib/gift-cards/product-rule'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'

/**
 * The admin switch for `products.is_gift_card` (closeout L10, row 21).
 *
 * ITS OWN ACTION, NOT A CHECKBOX IN THE PRODUCT FORM. The product form's
 * schema output is spread into more than one write, and a flag threaded
 * through it would also ride along on paths that have no business setting it.
 * More to the point, this flag changes how money is handled for the product
 * (no supplier split, the whole charge held as platform revenue until the
 * card is redeemed), so it gets a write of its own with its own check.
 *
 * ADMIN TIER ONLY, through `requireAdminSession`. A content uploader can edit
 * a product's name and photos and cannot turn it into stored value; the
 * uploader-prohibitions test holds this file to that guard.
 *
 * TURNING IT ON IS REFUSED unless the row already satisfies
 * `giftCardProductRefusal`. The row is read here, with the service client,
 * and never taken from the form: the form only says which product and which
 * way.
 */

export type GiftCardFlagState = { ok: boolean; error?: string; enabled?: boolean } | null

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function runSetProductGiftCard(
  _prev: GiftCardFlagState,
  formData: FormData,
): Promise<GiftCardFlagState> {
  // Redirects to the login page for anyone below the admin tier.
  const session = await requireAdminSession()

  const productId = String(formData.get('product_id') ?? '')
  if (!UUID.test(productId)) return { ok: false, error: 'מוצר לא תקין.' }
  const enable = formData.get('enable') === 'true'

  const admin = createAdminClient()
  const { data: row, error: readError } = await admin
    .from('products')
    .select('id, supplier_id, platform_percent, is_coupon_enabled, type, kenyon_price, full_price')
    .eq('id', productId)
    .is('deleted_at', null)
    .maybeSingle()
  if (readError) {
    log.error('gift_card_flag.read_failed', { productId, reason: readError.message })
    return { ok: false, error: 'קריאת המוצר נכשלה. נסו שוב.' }
  }
  if (!row) return { ok: false, error: 'המוצר לא נמצא.' }

  if (enable) {
    const refusal = giftCardProductRefusal(row)
    if (refusal) return { ok: false, error: refusal }
  }

  const { error: writeError } = await admin
    .from('products')
    .update({ is_gift_card: enable } as never)
    .eq('id', productId)
  if (writeError) {
    log.error('gift_card_flag.write_failed', { productId, reason: writeError.message })
    return { ok: false, error: 'השמירה נכשלה. נסו שוב.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'products',
    entityId: productId,
    changes: { is_gift_card: enable },
  })

  updateTag(CATALOGUE_TAG)
  revalidatePath(`/admin/products/${productId}/edit`)
  return { ok: true, enabled: enable }
}

export async function setProductGiftCard(
  prev: GiftCardFlagState,
  formData: FormData,
): Promise<GiftCardFlagState> {
  return withActionContext('admin.product_gift_card', () => runSetProductGiftCard(prev, formData))
}
