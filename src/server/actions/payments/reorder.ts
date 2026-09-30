'use server'

import { type ReorderCard, pickReorderCard, planReorderLines } from '@/lib/checkout/reorder'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { loadCardcomEnv } from '@/lib/payments'
import {
  PAYMENT_GATE_CLOSED_MESSAGE,
  assessPaymentProviderGate,
} from '@/lib/payments/provider-gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import type { CheckoutActionErrorCode } from '@/lib/validations/checkout'
import { addToCart, clearCart } from '@/server/actions/cart'
import { beginCheckout } from '@/server/actions/payments/checkout'
import { z } from 'zod'

/**
 * One-click reorder.
 *
 * WHAT "ONE CLICK" MEANS HERE. The shopper is on a past order in their account
 * and presses one button. This action rebuilds the cart from that order's
 * lines, picks the saved card, picks the delivery address, and runs the
 * ordinary `beginCheckout` with the saved token. That path charges the token
 * server-to-server (no hosted page, no card form, no redirect) and finalizes
 * inline, so on the happy path the next thing the shopper sees is the
 * confirmation. Nothing about money is decided here: prices, stock, commission
 * and the wallet are all `beginCheckout`'s, exactly as they are for a cart the
 * shopper built by hand.
 *
 * WHY THE CART IS REBUILT RATHER THAN BYPASSED. `beginCheckout` reads the
 * server-built cart and nothing else, on purpose: the cart is where stock,
 * availability, current price and the per-product commission snapshot are
 * checked, and every one of those may have changed since the original order.
 * Charging the old order's snapshot directly would sell at last month's price
 * and skip the stock reservation. So the cart is the contract, and this action
 * is a shopper who fills it very fast.
 *
 * THE 3DS FALLBACK. A token charge the issuer refuses with "come back with a
 * challenge" is not a decline; `beginCheckout` answers it by minting the hosted
 * page instead, under its own idempotency key. That surfaces here as
 * `challenge`, with the page URL, and the button sends the browser there at top
 * level. Cardcom runs the challenge on its page, returns into
 * `/checkout/frame-return`, and the return page settles the order through the
 * same server-to-server verify every hosted payment gets.
 *
 * WHEN THERE IS NO CARD OR NO ADDRESS. The cart is still rebuilt, and the
 * answer is `checkout`: the button opens the checkout page, where the shopper
 * types the one thing that was missing. That is the degraded reorder, and it
 * is still fewer steps than finding every product again.
 */

const reorderInputSchema = z.object({
  order_id: z.string().uuid(),
  /**
   * Minted by the button once per mount and reused on retry. It is the
   * `client_ref` `beginCheckout` keys its idempotent replay on, so a double
   * click or a retry after a network error replays the first attempt instead
   * of charging twice.
   */
  client_ref: z.string().uuid(),
})

export type ReorderResult =
  | { ok: true; kind: 'paid'; order_id: string; skipped: string[] }
  | { ok: true; kind: 'challenge'; order_id: string; redirect_url: string; skipped: string[] }
  | { ok: true; kind: 'checkout'; reason: 'no_card' | 'no_address'; skipped: string[] }
  | { ok: false; error: string; code: CheckoutActionErrorCode | 'NO_LINES'; cartRebuilt: boolean }

type Admin = ReturnType<typeof createAdminClient>

async function readSourceOrder(admin: Admin, orderId: string, userId: string) {
  const { data, error } = await admin
    .from('orders')
    .select('id, user_id, status, paid_at, address_id, deleted_at')
    .eq('id', orderId)
    .maybeSingle()
  if (error) {
    log.error('reorder.order_read_failed', { orderId, userId, reason: error.message })
    return { ok: false as const, error: 'לא ניתן לקרוא את ההזמנה כרגע, נסו שוב' }
  }
  // Ownership is checked here rather than by RLS because this runs on the
  // admin client: a foreign order id must read as "not found", never as a
  // rebuildable cart.
  if (!data || data.user_id !== userId || data.deleted_at) {
    return { ok: false as const, error: 'ההזמנה לא נמצאה' }
  }
  // Only a paid order is reorderable. A pending or cancelled one was never a
  // purchase, and "buy this again" is a promise about something that happened.
  if (!data.paid_at && data.status !== 'paid') {
    return { ok: false as const, error: 'ניתן להזמין שוב רק הזמנה ששולמה' }
  }
  return { ok: true as const, order: data }
}

async function readSourceLines(admin: Admin, orderId: string) {
  const { data, error } = await admin
    .from('order_items')
    .select('product_id, variant_id, quantity')
    .eq('order_id', orderId)
    .is('deleted_at', null)
  if (error) {
    log.error('reorder.items_read_failed', { orderId, reason: error.message })
    return { ok: false as const, error: 'לא ניתן לקרוא את פריטי ההזמנה כרגע, נסו שוב' }
  }
  return { ok: true as const, lines: data ?? [] }
}

/**
 * The card to charge, chosen from the customer's saved tokens by the same
 * rule the account page's button used to decide whether to offer one click.
 * Read on the admin client with an explicit owner filter, like the token
 * charge itself.
 */
async function readReorderCard(
  admin: Admin,
  userId: string,
  now: Date,
): Promise<ReorderCard | null> {
  const { data, error } = await admin
    .from('payment_tokens')
    .select('id, last_4, card_brand, expiry_month, expiry_year, is_default, created_at')
    .eq('profile_id', userId)
  if (error) {
    // A failed read is not "no card": it degrades to the checkout page, where
    // the shopper sees their saved cards listed by a fresh read.
    log.error('reorder.tokens_read_failed', { userId, reason: error.message })
    return null
  }
  return pickReorderCard(
    (data ?? []).map((row) => ({
      id: row.id,
      last4: row.last_4,
      cardBrand: row.card_brand,
      expiryMonth: row.expiry_month,
      expiryYear: row.expiry_year,
      isDefault: row.is_default,
      createdAt: row.created_at,
    })),
    now,
  )
}

/**
 * Where to deliver: the address the original order went to, if it is still
 * on file, else the customer's current default. Null when there is neither,
 * which `beginCheckout` turns into ADDRESS_REQUIRED for a physical basket and
 * ignores for a coupon-only one.
 */
async function resolveAddressId(
  admin: Admin,
  userId: string,
  sourceAddressId: string | null,
): Promise<string | null> {
  if (sourceAddressId) {
    const { data, error } = await admin
      .from('user_addresses')
      .select('id, user_id, deleted_at')
      .eq('id', sourceAddressId)
      .maybeSingle()
    if (error) {
      log.error('reorder.address_read_failed', { userId, reason: error.message })
    } else if (data && data.user_id === userId && !data.deleted_at) {
      return data.id
    }
  }
  const { data: fallback, error: fallbackError } = await admin
    .from('user_addresses')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (fallbackError) {
    log.error('reorder.default_address_read_failed', { userId, reason: fallbackError.message })
    return null
  }
  return fallback?.id ?? null
}

/**
 * Replaces the cart with the order's lines, one `addToCart` per line so every
 * line goes through the same availability, stock and quantity checks a
 * product page add does. A line the cart refuses is skipped and named, not
 * fatal: a discontinued item should not block the other four.
 */
async function rebuildCart(
  admin: Admin,
  lines: ReturnType<typeof planReorderLines>['lines'],
): Promise<{ ok: true; added: number; skipped: string[] } | { ok: false; error: string }> {
  const cleared = await clearCart()
  if (!cleared.ok) {
    return { ok: false, error: cleared.error }
  }
  let added = 0
  const skippedIds: string[] = []
  for (const line of lines) {
    const result = await addToCart(line.productId, line.variantId, line.quantity)
    if (result.ok) {
      added += 1
    } else {
      skippedIds.push(line.productId)
      log.info('reorder.line_skipped', {
        productId: line.productId,
        code: result.code,
        reason: result.error,
      })
    }
  }
  return { ok: true, added, skipped: await nameProducts(admin, skippedIds) }
}

async function nameProducts(admin: Admin, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const { data, error } = await admin.from('products').select('id, name_he').in('id', ids)
  if (error || !data) return ids.map(() => 'פריט שאינו זמין')
  const names = new Map(data.map((row) => [row.id, row.name_he as string]))
  return ids.map((id) => names.get(id) ?? 'פריט שאינו זמין')
}

async function runReorderOneClick(rawInput: unknown): Promise<ReorderResult> {
  // Same two switches `beginCheckout` reads, checked before the cart is
  // touched: a closed gate must not leave the shopper's cart replaced.
  const gate = assessPaymentProviderGate(loadCardcomEnv())
  if (!gate.live) {
    return {
      ok: false,
      error: PAYMENT_GATE_CLOSED_MESSAGE,
      code: 'CHECKOUT_DISABLED',
      cartRebuilt: false,
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      error: 'יש להתחבר כדי להזמין שוב',
      code: 'UNAUTHENTICATED',
      cartRebuilt: false,
    }
  }

  const parsed = reorderInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: 'בקשת הזמנה חוזרת לא תקינה', code: 'VALIDATION', cartRebuilt: false }
  }

  // Tighter than begin_checkout's 10/min on purpose: each attempt is a cart
  // rebuild plus a charge, and a shopper never needs five of those a minute.
  const allowed = await checkRateLimit(`reorder:user:${user.id}`, 5, 60)
  if (!allowed) {
    return {
      ok: false,
      error: 'יותר מדי ניסיונות, המתינו דקה',
      code: 'RATE_LIMITED',
      cartRebuilt: false,
    }
  }

  const admin = createAdminClient()
  const now = new Date()

  const source = await readSourceOrder(admin, parsed.data.order_id, user.id)
  if (!source.ok) return { ok: false, error: source.error, code: 'NOT_FOUND', cartRebuilt: false }

  const sourceLines = await readSourceLines(admin, source.order.id)
  if (!sourceLines.ok)
    return { ok: false, error: sourceLines.error, code: 'INTERNAL', cartRebuilt: false }

  const plan = planReorderLines(sourceLines.lines)
  if (plan.lines.length === 0) {
    return {
      ok: false,
      error: 'המוצרים מההזמנה הזו אינם קיימים עוד',
      code: 'NO_LINES',
      cartRebuilt: false,
    }
  }

  const rebuilt = await rebuildCart(admin, plan.lines)
  if (!rebuilt.ok) return { ok: false, error: rebuilt.error, code: 'INTERNAL', cartRebuilt: false }
  if (rebuilt.added === 0) {
    return {
      ok: false,
      error: 'אף פריט מההזמנה אינו זמין כרגע',
      code: 'NO_LINES',
      cartRebuilt: true,
    }
  }
  const skipped = rebuilt.skipped
  log.info('reorder.cart_rebuilt', {
    userId: user.id,
    sourceOrderId: source.order.id,
    added: rebuilt.added,
    skipped: skipped.length,
    droppedWithoutProduct: plan.droppedWithoutProduct,
  })

  const card = await readReorderCard(admin, user.id, now)
  if (!card) {
    return { ok: true, kind: 'checkout', reason: 'no_card', skipped }
  }

  const addressId = await resolveAddressId(admin, user.id, source.order.address_id)

  const result = await beginCheckout({
    client_ref: parsed.data.client_ref,
    // The terms were accepted on the order being repeated (orders stamps
    // accepted_terms_at at creation) and the button says so in its own words;
    // a checkbox here would be the second click the feature exists to remove.
    accept_terms: true,
    channel: 'web',
    // The wallet is applied at checkout by the shopper's choice, never
    // automatically (CLAUDE skill: "Applied as a discount on the next order at
    // checkout, not automatically"). A one-click charge is the card only.
    apply_wallet_ils: 0,
    // Charging an existing token cannot mint another one.
    save_card: false,
    address_id: addressId,
    token_id: card.id,
  })

  if (!result.ok) {
    if (result.code === 'ADDRESS_REQUIRED') {
      return { ok: true, kind: 'checkout', reason: 'no_address', skipped }
    }
    return { ok: false, error: result.error, code: result.code, cartRebuilt: true }
  }
  if (result.data.kind === 'paid') {
    return { ok: true, kind: 'paid', order_id: result.data.order_id, skipped }
  }
  return {
    ok: true,
    kind: 'challenge',
    order_id: result.data.order_id,
    redirect_url: result.data.redirect_url,
    skipped,
  }
}

export async function reorderOneClick(rawInput: unknown): Promise<ReorderResult> {
  return withActionContext('checkout.reorder', () => runReorderOneClick(rawInput))
}
