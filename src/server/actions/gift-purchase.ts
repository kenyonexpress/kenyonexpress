'use server'

import { resolveStorefrontProductType } from '@/lib/commerce/product-type'
import { GIFT_DRAFT_COOKIE, GIFT_DRAFT_MAX_AGE_SECONDS, encodeGiftDraft } from '@/lib/gifts/draft'
import { resolveGiftDeliverAt } from '@/lib/gifts/wrap'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import { giftSchema } from '@/lib/validations/checkout'
import { addToCart } from '@/server/actions/cart'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

/**
 * S22: "send this coupon as a gift", started from /gift/[product].
 *
 * NOT A SECOND CHECKOUT. The gift is paid for through the one checkout that
 * already exists, and every gift rule (one recipient per order, the 500-char
 * greeting, the 365-day schedule ceiling, the server-priced wrapping fee, the
 * schedule dropped past the coupon's expiry) is enforced there and in
 * `sendOrderGifts`. This action does two things only: puts the coupon in the
 * cart, and hands the gift details to the checkout form as a prefill
 * (`src/lib/gifts/draft.ts`). The shopper sees them there, ticked and filled,
 * and can still change or untick them before paying.
 */

export type GiftPurchaseState = { error: string } | null

const inputSchema = giftSchema.extend({
  product_id: z.string().uuid(),
  gift_recipient_email: z.string().trim().email('כתובת המייל של המקבל אינה תקינה').max(200),
})

export async function startGiftPurchase(
  prev: GiftPurchaseState,
  formData: FormData,
): Promise<GiftPurchaseState> {
  return withActionContext('gifts.start_purchase', () => runStartGiftPurchase(prev, formData))
}

async function runStartGiftPurchase(
  _prev: GiftPurchaseState,
  formData: FormData,
): Promise<GiftPurchaseState> {
  const text = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }

  const parsed = inputSchema.safeParse({
    product_id: text('product_id'),
    gift_recipient_email: text('gift_recipient_email') ?? '',
    gift_recipient_name: text('gift_recipient_name'),
    gift_message: text('gift_message'),
    gift_deliver_at: text('gift_deliver_at'),
    gift_wrap: formData.get('gift_wrap') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'יש לבדוק את פרטי המתנה' }
  }
  const input = parsed.data

  // The same check checkout runs, asked here too so a bad date is refused on
  // the page where it was typed and not two steps later.
  const schedule = resolveGiftDeliverAt(input.gift_deliver_at)
  if (!schedule.ok) return { error: schedule.error }

  // A gift is a coupon that changes hands. A physical line ships to an address
  // and checkout does not offer the gift block for it, so neither does this.
  const { data: product, error } = await createPublicClient()
    .from('products')
    .select('id, type, is_coupon_enabled')
    .eq('id', input.product_id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    log.error('gifts.start_purchase.read_failed', { err: error.message })
    return { error: 'לא הצלחנו לטעון את המוצר, נסו שוב' }
  }
  if (!product || resolveStorefrontProductType(product) !== 'coupon') {
    return { error: 'אפשר לשלוח כמתנה רק קופון' }
  }

  // Stock, the per-order cap, the sellable phase and the rate limit are all
  // the cart's to decide. A refusal there is shown as-is.
  const added = await addToCart(product.id, null, 1)
  if (!added.ok) return { error: added.error }

  const cookieStore = await cookies()
  cookieStore.set(
    GIFT_DRAFT_COOKIE,
    encodeGiftDraft({
      gift_recipient_email: input.gift_recipient_email,
      gift_recipient_name: input.gift_recipient_name,
      gift_message: input.gift_message,
      gift_deliver_at: input.gift_deliver_at,
      gift_wrap: input.gift_wrap,
    }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/checkout',
      maxAge: GIFT_DRAFT_MAX_AGE_SECONDS,
    },
  )

  redirect('/checkout')
}
