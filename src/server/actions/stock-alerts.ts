'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { isInStock } from '@/lib/wishlist/alerts'
import { z } from 'zod'

/**
 * "Tell me when it is back" (STEP 58), the writer 195 described and nobody
 * built: the table, its RPC and the daily drain have been live since
 * 2026-09-09 with zero rows, because the sold-out page offered no way in.
 *
 * GUESTS ARE ALLOWED, BY EMAIL, as 195 decided: requiring an account turns
 * the moment of interest into a signup form. A signed-in shopper's session
 * address wins over whatever was typed, and their `user_id` is recorded so
 * the request can be shown in their account; a guest gives an address and
 * nothing else.
 *
 * THE ANSWER IS THE SAME WHETHER THE ROW WAS NEW OR ALREADY THERE. The RPC
 * returns void on purpose (its header explains: a caller who could tell
 * "already on the list" from "added" could probe whether an address is
 * watching a product). This action keeps that property and adds nothing to it.
 *
 * NOT FOR A PRODUCT THAT IS ON THE SHELF. The cron drains every pending row
 * whose product is in stock on its next run, so a request made against an
 * in-stock product would mail "it is back" tomorrow morning about a product
 * that never left. The action refuses that with a plain message instead.
 *
 * Rate limited per IP: this endpoint causes a mail to an arbitrary address
 * (once, later), which is enough to be worth five an hour.
 */

const schema = z.object({
  productId: z.string().uuid('מוצר לא תקין'),
  variantId: z.string().uuid('וריאציה לא תקינה').nullable(),
  email: z.string().trim().email('כתובת מייל לא תקינה').max(254).or(z.literal('')),
  // Bots fill every field. Humans leave this alone (hidden with CSS).
  company: z.string().optional().default(''),
})

export type StockAlertState = { ok: boolean; message?: string; error?: string }

const RECEIVED = 'נעדכן אותך במייל ברגע שהמוצר יחזור למלאי.'
const IN_STOCK = 'המוצר במלאי עכשיו ואפשר להזמין אותו.'

async function runJoinStockWaitlist(
  _prev: StockAlertState,
  formData: FormData,
): Promise<StockAlertState> {
  const variantRaw = formData.get('variantId')
  const parsed = schema.safeParse({
    productId: formData.get('productId'),
    variantId: typeof variantRaw === 'string' && variantRaw !== '' ? variantRaw : null,
    email: formData.get('email') ?? '',
    company: formData.get('company') ?? '',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'בדקו את הפרטים ונסו שוב.' }
  }

  // Honeypot hit: pretend success so the bot does not retry with a different shape.
  if (parsed.data.company) return { ok: true, message: RECEIVED }

  // The session's address outranks the typed one; a guest has only the typed one.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const email = (user?.email ?? parsed.data.email).trim().toLowerCase()
  if (!email) return { ok: false, error: 'נא למלא כתובת מייל.' }

  const ip = await getClientIp()
  if (!(await checkRateLimit(`stock-alert:${ip}`, 5, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  const admin = createAdminClient()
  const { productId, variantId } = parsed.data

  const { data: product, error: productError } = await admin
    .from('products')
    .select('id, status, stock_quantity')
    .eq('id', productId)
    .is('deleted_at', null)
    .maybeSingle()
  if (productError) {
    log.warn('stock_alert.product_read_failed', { productId, reason: productError.message })
    return { ok: false, error: 'השמירה נכשלה. נסו שוב מאוחר יותר.' }
  }
  if (!product) return { ok: false, error: 'המוצר לא נמצא.' }

  let soldOut = !isInStock(product.stock_quantity, product.status)
  if (variantId) {
    const { data: variant, error: variantError } = await admin
      .from('product_variants')
      .select('id, stock_quantity')
      .eq('id', variantId)
      .eq('product_id', productId)
      .is('deleted_at', null)
      .maybeSingle()
    if (variantError) {
      log.warn('stock_alert.variant_read_failed', { productId, reason: variantError.message })
      return { ok: false, error: 'השמירה נכשלה. נסו שוב מאוחר יותר.' }
    }
    if (!variant) return { ok: false, error: 'הווריאציה לא נמצאה.' }
    // A variant at zero is sold out even when the product's own level is not.
    soldOut = soldOut || variant.stock_quantity === 0
  }
  if (!soldOut) return { ok: false, error: IN_STOCK }

  const { error } = await admin.rpc(
    'join_stock_waitlist' as never,
    {
      p_product_id: productId,
      p_email: email,
      p_variant_id: variantId,
      p_user_id: user?.id ?? null,
    } as never,
  )
  if (error) {
    log.warn('stock_alert.join_failed', { productId, reason: error.message })
    return { ok: false, error: 'השמירה נכשלה. נסו שוב מאוחר יותר.' }
  }

  return { ok: true, message: RECEIVED }
}

export async function joinStockWaitlist(
  _prev: StockAlertState,
  formData: FormData,
): Promise<StockAlertState> {
  return withActionContext('stock_alert.join', () => runJoinStockWaitlist(_prev, formData))
}
