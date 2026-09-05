'use server'

import { type CouponRecord, evaluateCoupon, normalizeCouponCode } from '@/lib/cart/coupon'
import {
  GUEST_SESSION_COOKIE,
  ensureGuestSessionId,
  getGuestSessionId,
} from '@/lib/cart/guest-session'
import { loadCartProductData } from '@/lib/cart/load-products'
import { buildCartView } from '@/lib/cart/pricing'
import { parsePercentSnapshot } from '@/lib/cart/snapshot'
import type { CartActionResult, CartStorageItem, CartView } from '@/lib/cart/types'
import { isImplausibleDiscount } from '@/lib/commerce/implausible-discount'
import { growthClient } from '@/lib/growth/client'
import { evaluateDiscount } from '@/lib/growth/discount'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createGuestCartClient, createPublicClient } from '@/lib/supabase/anon'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { addToCartSchema, updateCartItemSchema } from '@/lib/validations/cart'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

const CART_EXPIRY_DAYS = 30

/**
 * The applied discount code lives in a cookie, not in a `carts` column.
 *
 * A column would need a migration, and an unapplied migration on the main
 * branch is the trap GO-LIVE already carries once. The cookie is safe here for
 * a specific reason: it holds the CODE and nothing else. The discount is
 * re-read from `public.coupons` and re-evaluated against the live cart on every
 * render and again at checkout, so a shopper who edits it can only name a
 * different code, never a different amount, and a code that expires or runs out
 * stops working the moment it does.
 */
const CART_COUPON_COOKIE = 'ke_cart_coupon'
const COUPON_COOKIE_MAX_AGE = CART_EXPIRY_DAYS * 24 * 60 * 60

function itemKey(item: CartStorageItem): string {
  return `${item.product_id}::${item.variant_id ?? 'null'}`
}

function parseItems(raw: unknown): CartStorageItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (item): item is CartStorageItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as CartStorageItem).product_id === 'string' &&
        typeof (item as CartStorageItem).quantity === 'number',
    )
    .map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      quantity: item.quantity,
      // Rebuilt field by field rather than spread. The `items` column is JSONB
      // and whatever is in it is what comes back; copying it wholesale would
      // carry any key a past version (or a stray write) left behind into
      // everything downstream. The percent in particular is re-validated here
      // rather than trusted, so a hand-edited row cannot name its own rate.
      platform_percent_snapshot: parsePercentSnapshot(item.platform_percent_snapshot),
    }))
}

function expiresAt(): string {
  return new Date(Date.now() + CART_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

async function checkCartWriteRateLimit(userId: string | null): Promise<boolean> {
  if (userId) return checkRateLimit(`cart_write:user:${userId}`, 120, 3600)
  const ip = await getClientIp()
  return checkRateLimit(`cart_write:ip:${ip}`, 120, 3600)
}

/**
 * Prices a site-wide campaign against this cart, or returns null if the code is
 * not one. Null is not a failure: the caller falls through to the legacy
 * supplier coupons table.
 */
async function evaluateCampaignCode(
  code: string,
  view: CartView,
): Promise<{ code: string; label: string; discountAgorot: number } | null> {
  const { data } = await growthClient().campaigns().byCode(code)
  if (!data) return null

  const evaluation = evaluateDiscount(
    data,
    {
      // Both already agorot. This branch was written against the pre-GOAL-1
      // cart, where the view carried shekel floats, and multiplied each one by
      // 100 on the way in. It is the same round trip `resolveCheckoutDiscountAgorot`
      // below already dropped, and it is why this merge waited.
      payableAgorot: view.subtotal,
      // The ceiling. The discount is funded from the platform commission and
      // never from the supplier's share (05a181a), so the cart may not promise
      // more than the platform earns on it.
      commissionAgorot: view.platform_fee,
    },
    new Date(),
  )

  if (!evaluation.ok) return null
  return {
    code: evaluation.code,
    label: evaluation.label,
    discountAgorot: evaluation.discountAgorot,
  }
}

/**
 * Reads the cookie's code and prices it against this cart. Returns null for no
 * code, an unknown code, or a code that has stopped being valid — the cart then
 * renders as if none were applied, which is the truthful state.
 */
async function resolveAppliedCoupon(
  view: CartView,
): Promise<{ code: string; label: string; discountAgorot: number } | null> {
  const cookieStore = await cookies()
  const code = normalizeCouponCode(cookieStore.get(CART_COUPON_COOKIE)?.value)
  if (!code) return null

  // Site-wide campaigns first.
  //
  // `discount_campaigns` is the platform's own table (096); `public.coupons` is
  // supplier-scoped and predates it. A code can only be one or the other, and
  // checking the campaign first means a marketing code is never shadowed by a
  // legacy row that happens to share its text.
  //
  // platform_fee is the commission on this cart, and passing it means the cart
  // caps the discount at the money that funds it rather than quoting a number
  // settlement will later cut down. A quote the charge does not honour is the
  // exact bug coupon-offer.ts already cost this project once.
  const campaign = await evaluateCampaignCode(code, view)
  if (campaign) return campaign

  // `coupons` is readable by anon only where `is_active`, so a deactivated code
  // arrives here as null rather than as an inactive row. `evaluateCoupon`
  // rejects both, and this function returns null either way.
  const { data } = await createPublicClient()
    .from('coupons')
    .select(
      'id, code, discount_type, discount_value, min_purchase, expires_at, is_active, max_uses, used_count, product_id',
    )
    .ilike('code', code)
    .maybeSingle()

  const evaluation = evaluateCoupon(
    (data as CouponRecord | null) ?? null,
    {
      payableAgorot: view.subtotal,
      productIds: view.items.map((item) => item.product_id),
    },
    new Date(),
  )

  if (!evaluation.ok) return null
  return {
    code: evaluation.code,
    label: evaluation.label,
    discountAgorot: evaluation.discountAgorot,
  }
}

async function resolveCartView(cartId: string | null, items: CartStorageItem[]): Promise<CartView> {
  const { products, variants } = await loadCartProductData(items)
  const priced = buildCartView(cartId, items, products, variants)
  // Nothing to discount, so neither code table is worth two round trips. This
  // covers the empty cart and, since the pricer stopped blanking them, the cart
  // whose every line is unpriceable: both charge zero, and every discount path
  // caps itself at the payable total anyway, so the answer is already known.
  if (priced.items.length === 0 || priced.subtotal === 0) return priced
  // Priced twice on purpose: the coupon needs the payable total to judge a
  // minimum and to cap itself, and that total is only known after the lines are
  // priced. The second pass costs no query.
  const coupon = await resolveAppliedCoupon(priced)
  return coupon ? buildCartView(cartId, items, products, variants, coupon) : priced
}

type CartRow = { id: string; items: unknown }

async function getCartRow(): Promise<{
  row: CartRow | null
  isGuest: boolean
  userId: string | null
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const result = await supabase
      .from('carts')
      .select('id, items')
      .eq('profile_id', user.id)
      .maybeSingle()
    return { row: cartRowOrFail(result, user.id), isGuest: false, userId: user.id }
  }

  const sessionId = (await getGuestSessionId()) ?? (await ensureGuestSessionId())
  const result = await createGuestCartClient(sessionId)
    .from('carts')
    .select('id, items')
    .eq('session_id', sessionId)
    .is('profile_id', null)
    .maybeSingle()

  return { row: cartRowOrFail(result, sessionId), isGuest: true, userId: null }
}

/**
 * The shopper's own cart row, or a throw. Never a silent null.
 *
 * `.maybeSingle()` reports a genuinely absent cart as `data: null` with NO
 * error, so every error here is exceptional - and one of them is a trap that
 * repairs nothing on its own. postgrest-js synthesises PGRST116 when the filter
 * matched MORE than one row (`dist/index.mjs`: `if (isMaybeSingle &&
 * Array.isArray(data)) if (data.length > 1)`), and `public.carts` has no unique
 * index on `profile_id` to stop a second row existing. Discarded, that error
 * read as "this account has no cart": the cart showed empty on every request,
 * and every write, seeing no existing id, inserted yet another row. Note that
 * `orFail` is deliberately NOT used - it exempts PGRST116 as "a `.single()`
 * found no row", which is the right call for the catalogue and the exact wrong
 * one here, where PGRST116 can only mean duplicates.
 */
function cartRowOrFail(
  result: { data: CartRow | null; error: { code?: string; message?: string } | null },
  owner: string,
): CartRow | null {
  if (!result.error) return result.data
  log.error('cart.row_read_failed', { owner, error: result.error })
  throw new Error(`cart.row_read_failed: ${result.error.message ?? 'cart read failed'}`)
}

async function saveCartItems(
  items: CartStorageItem[],
  isGuest: boolean,
  userId: string | null,
  existingId: string | null,
): Promise<CartRow> {
  const expiry = expiresAt()

  if (isGuest) {
    const sessionId = await ensureGuestSessionId()
    const guest = createGuestCartClient(sessionId)

    if (existingId) {
      // Filtered by id, but reached under the policy's USING clause, which still
      // demands the cookie match this row's session_id. One shopper cannot write
      // another's cart by naming its id.
      const { data, error } = await guest
        .from('carts')
        .update({ items, expires_at: expiry })
        .eq('id', existingId)
        .select('id, items')
        .single()
      if (error) throw error
      return data
    }

    const { data, error } = await guest
      .from('carts')
      .insert({ session_id: sessionId, items, expires_at: expiry })
      .select('id, items')
      .single()
    if (error) throw error
    return data
  }

  const supabase = await createClient()
  if (existingId) {
    const { data, error } = await supabase
      .from('carts')
      .update({ items, expires_at: expiry })
      .eq('id', existingId)
      .select('id, items')
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('carts')
    .insert({ profile_id: userId!, items, expires_at: expiry })
    .select('id, items')
    .single()
  if (error) throw error
  return data
}

/**
 * Availability gate for one line, and the source of the percent snapshot.
 *
 * `platformPercent` comes back on the success branch because this function
 * already holds the product row: reading it here costs nothing, and it means
 * the snapshot written into the cart is always a value the server read from
 * `public.products` in the same breath as it approved the line. The browser
 * never gets a say in it. Null when the admin has not set one — the cart then
 * stores no snapshot and `pricing.ts` marks the line unpriceable, which is the
 * behaviour C1 requires and is not the same thing as a percent of zero.
 */
async function validateProductForCart(
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<
  { ok: true; platformPercent: number | null } | { ok: false; error: string; code: string }
> {
  const catalogue = createPublicClient()

  const { data: product } = await catalogue
    .from('products')
    .select(
      'id, status, deleted_at, stock_quantity, type, is_coupon_enabled, platform_percent, kenyon_price, full_price',
    )
    .eq('id', productId)
    .maybeSingle()

  if (!product || product.status !== 'active' || product.deleted_at) {
    return { ok: false, error: 'המוצר לא זמין', code: 'NOT_FOUND' }
  }

  // A price that is an implausible fraction of its own compare-at is a data
  // error, not an offer, and this refuses to put one in a cart at all.
  //
  // The cart pricer refuses the same line again when it prices it, and
  // `beginCheckout` refuses it a third time through `validateCartView`. That is
  // deliberate rather than redundant: this gate only sees an ADD, so it cannot
  // help a line already sitting in a cart from before the price broke, or one
  // whose compare-at was edited afterwards. The pricer is the gate that holds
  // for those. Refusing here as well is what keeps the shopper from being told
  // "נוסף לסל" about something the cart will immediately mark unavailable.
  if (isImplausibleDiscount(product.kenyon_price, product.full_price)) {
    return { ok: false, error: 'המוצר לא זמין', code: 'NOT_FOUND' }
  }

  const platformPercent = parsePercentSnapshot(product.platform_percent)

  if (variantId) {
    const { data: variant } = await catalogue
      .from('product_variants')
      .select('id, product_id, stock_quantity, is_active, deleted_at')
      .eq('id', variantId)
      .maybeSingle()

    if (!variant || variant.product_id !== productId || !variant.is_active || variant.deleted_at) {
      return { ok: false, error: 'גרסה לא תקינה', code: 'STATE_INVALID' }
    }

    const stock = variant.stock_quantity ?? product.stock_quantity
    if (stock != null && stock < quantity) {
      return { ok: false, error: 'אין מספיק במלאי', code: 'INSUFFICIENT_STOCK' }
    }
    return { ok: true, platformPercent }
  }

  const stock = product.stock_quantity
  if (stock != null && stock < quantity) {
    return { ok: false, error: 'אין מספיק במלאי', code: 'INSUFFICIENT_STOCK' }
  }

  return { ok: true, platformPercent }
}

function revalidateCartPaths() {
  revalidatePath('/cart')
  revalidatePath('/', 'layout')
}

function fail(error: string, code: string): CartActionResult {
  return { ok: false, error, code }
}

async function runGetCart(): Promise<CartView> {
  const { row } = await getCartRow()
  const items = parseItems(row?.items)
  return resolveCartView(row?.id ?? null, items)
}

async function runAddToCart(
  productId: string,
  variantId: string | null = null,
  quantity = 1,
): Promise<CartActionResult> {
  const parsed = addToCartSchema.safeParse({
    product_id: productId,
    variant_id: variantId,
    quantity,
  })
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'נתונים לא תקינים', 'VALIDATION')
  }

  const { row, isGuest, userId } = await getCartRow()
  const allowed = await checkCartWriteRateLimit(userId)
  if (!allowed) return fail('יותר מדי פעולות — נסו שוב מאוחר יותר', 'RATE_LIMITED')

  const validation = await validateProductForCart(
    parsed.data.product_id,
    parsed.data.variant_id,
    parsed.data.quantity,
  )
  if (!validation.ok) return validation

  const items = parseItems(row?.items)
  const key = itemKey(parsed.data)
  const existing = items.find((i) => itemKey(i) === key)
  const nextQty = Math.min(99, (existing?.quantity ?? 0) + parsed.data.quantity)

  const stockCheck = await validateProductForCart(
    parsed.data.product_id,
    parsed.data.variant_id,
    nextQty,
  )
  if (!stockCheck.ok) return stockCheck

  // The snapshot is refreshed on every add, including an add onto an existing
  // line. The alternative — writing it once and leaving it — would mean the
  // percent shown against a line was the one that applied to its FIRST unit,
  // while every unit after it was quoted under whatever the catalogue says now.
  // Re-stamping keeps the stored percent describing the whole line as it
  // currently stands, which is what checkout will read anyway.
  const percentSnapshot = stockCheck.platformPercent
  const nextItems = existing
    ? items.map((i) =>
        itemKey(i) === key
          ? { ...i, quantity: nextQty, platform_percent_snapshot: percentSnapshot }
          : i,
      )
    : [
        ...items,
        {
          product_id: parsed.data.product_id,
          variant_id: parsed.data.variant_id,
          quantity: nextQty,
          platform_percent_snapshot: percentSnapshot,
        },
      ]

  const saved = await saveCartItems(nextItems, isGuest, userId, row?.id ?? null)
  const cart = await resolveCartView(saved.id, parseItems(saved.items))
  revalidateCartPaths()
  return { ok: true, cart }
}

async function runUpdateCartItem(
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<CartActionResult> {
  const parsed = updateCartItemSchema.safeParse({
    product_id: productId,
    variant_id: variantId,
    quantity,
  })
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'נתונים לא תקינים', 'VALIDATION')
  }

  const { row, isGuest, userId } = await getCartRow()
  if (!row) return fail('העגלה ריקה', 'NOT_FOUND')

  const allowed = await checkCartWriteRateLimit(userId)
  if (!allowed) return fail('יותר מדי פעולות — נסו שוב מאוחר יותר', 'RATE_LIMITED')

  const key = itemKey(parsed.data)
  let items = parseItems(row.items)

  if (parsed.data.quantity === 0) {
    items = items.filter((i) => itemKey(i) !== key)
  } else {
    const validation = await validateProductForCart(
      parsed.data.product_id,
      parsed.data.variant_id,
      parsed.data.quantity,
    )
    if (!validation.ok) return validation

    const exists = items.some((i) => itemKey(i) === key)
    if (!exists) return fail('פריט לא נמצא בעגלה', 'NOT_FOUND')

    items = items.map((i) => (itemKey(i) === key ? { ...i, quantity: parsed.data.quantity } : i))
  }

  const saved = await saveCartItems(items, isGuest, userId, row.id)
  const cart = await resolveCartView(saved.id, parseItems(saved.items))
  revalidateCartPaths()
  return { ok: true, cart }
}

async function runRemoveFromCart(
  productId: string,
  variantId: string | null = null,
): Promise<CartActionResult> {
  return runUpdateCartItem(productId, variantId, 0)
}

/**
 * Drops every line the priced cart marks unavailable, in one write.
 *
 * WHY IT DOES NOT TAKE A LIST. The obvious shape is for the browser to send the
 * keys it has rendered as unavailable, and it is the wrong one: the cart on
 * screen is as old as the last render, so a list built from it can name a line
 * that has since come back into stock, and the shopper would press "remove the
 * unavailable ones" and lose an item that was fine. Worse, a hand-sent list is
 * an arbitrary delete of anything in the cart under a name that reads harmless.
 * So the server re-prices the cart it actually holds and decides for itself;
 * the browser is asking a question, not naming rows.
 *
 * Removing nothing is a success, not an error. The banner offering this is
 * rendered from the same possibly-stale view, so "you pressed it and by then
 * there was nothing left to remove" is a normal race and not a failure the
 * shopper should be shown.
 */
async function runRemoveUnavailableItems(): Promise<CartActionResult> {
  const { row, isGuest, userId } = await getCartRow()
  if (!row) return { ok: true, cart: await resolveCartView(null, []) }

  const items = parseItems(row.items)
  if (items.length === 0) return { ok: true, cart: await resolveCartView(row.id, items) }

  const priced = await resolveCartView(row.id, items)
  const unavailable = new Set(priced.items.filter((i) => !i.available).map((i) => itemKey(i)))
  // A line the pricer dropped entirely -- a product row that no longer exists,
  // which `buildCartView` skips with `continue` rather than rendering -- never
  // appears in `priced.items` at all. It is unavailable in the only sense that
  // matters and is exactly what a shopper stuck behind this banner cannot see
  // or remove, so it goes too.
  const rendered = new Set(priced.items.map((i) => itemKey(i)))
  const kept = items.filter((i) => rendered.has(itemKey(i)) && !unavailable.has(itemKey(i)))

  if (kept.length === items.length) return { ok: true, cart: priced }

  const allowed = await checkCartWriteRateLimit(userId)
  if (!allowed) return fail('יותר מדי פעולות — נסו שוב מאוחר יותר', 'RATE_LIMITED')

  const saved = await saveCartItems(kept, isGuest, userId, row.id)
  const cart = await resolveCartView(saved.id, parseItems(saved.items))
  revalidateCartPaths()
  return { ok: true, cart }
}

async function runClearCart(): Promise<CartActionResult> {
  const { row, isGuest, userId } = await getCartRow()
  if (!row) return { ok: true, cart: await resolveCartView(null, []) }

  const allowed = await checkCartWriteRateLimit(userId)
  if (!allowed) return fail('יותר מדי פעולות — נסו שוב מאוחר יותר', 'RATE_LIMITED')

  const saved = await saveCartItems([], isGuest, userId, row.id)
  const cart = await resolveCartView(saved.id, [])
  revalidateCartPaths()
  return { ok: true, cart }
}

// ── Guest cart merge (login) ────────────────────────────────────────────────

/**
 * Moves the guest cart onto the account at login.
 *
 * Takes the caller's already-authenticated client rather than building one. Both
 * call sites reach here in the same breath as `signInWithPassword` /
 * `exchangeCodeForSession`, and that client holds the new session in memory. A
 * fresh client would have to find it by re-reading cookies that were written
 * moments earlier in the same request, and if it missed, RLS would hide the
 * account's own cart and the merge would silently drop the shopper's items.
 *
 * The two halves run under two different identities on purpose: the guest row is
 * reached with the session cookie, the account row with the user's token.
 * Neither client can touch a cart that is not one of those two.
 */
async function runMergeGuestCart(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const guest = createGuestCartClient(sessionId)

  const [guestResult, userResult] = await Promise.all([
    guest
      .from('carts')
      .select('id, items')
      .eq('session_id', sessionId)
      .is('profile_id', null)
      .maybeSingle(),
    supabase.from('carts').select('id, items').eq('profile_id', userId).maybeSingle(),
  ])

  // NEITHER read may be discarded, and the account one is the dangerous half.
  // Every branch below reads "no id" as "this account has no cart yet", so a
  // failed read took the INSERT branch - and `public.carts` has no unique index
  // on `profile_id` (measured against production 2026-08-20), so the insert
  // SUCCEEDS and the profile ends up owning two rows. `getCartRow` then reads
  // both with `.maybeSingle()`, which is the PGRST116 `cartRowOrFail` exists
  // for. The guest half matters for the other direction: it is deleted below
  // unconditionally, so a failed read there loses the items it was about to
  // merge. Returning false rather than throwing because all three callers are
  // on the login path, after the session is already exchanged: a login that
  // succeeded must not fail over a cart. The caller keeps the guest cookie on false, and
  // the merge is retried at the next login instead of being orphaned.
  const failure = guestResult.error ?? userResult.error
  if (failure) {
    log.error('cart.merge_read_failed', { userId, sessionId, error: failure })
    return false
  }

  const guestCart = guestResult.data
  const userCart = userResult.data

  if (!guestCart || !Array.isArray(guestCart.items) || guestCart.items.length === 0) return true

  const guestItems = parseItems(guestCart.items)
  const userItems = parseItems(userCart?.items)

  const merged = new Map<string, CartStorageItem>(
    userItems.map((item) => [itemKey(item), { ...item }]),
  )
  for (const gItem of guestItems) {
    const key = itemKey(gItem)
    const existing = merged.get(key)
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + gItem.quantity)
    } else {
      merged.set(key, { ...gItem })
    }
  }

  const mergedItems = [...merged.values()]

  await Promise.all([
    userCart?.id
      ? supabase.from('carts').update({ items: mergedItems }).eq('id', userCart.id)
      : supabase.from('carts').insert({ profile_id: userId, items: mergedItems }),
    guest.from('carts').delete().eq('id', guestCart.id),
  ])

  return true
}

async function runClearGuestSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(GUEST_SESSION_COOKIE)
}

// ── Discount codes ──────────────────────────────────────────────────────────

export type CouponActionResult =
  | { ok: true; cart: CartView }
  | { ok: false; error: string; code: string }

/**
 * Applies a discount code to the current cart.
 *
 * The cookie is only written after the code has been read from the database and
 * priced against this exact cart, so an accepted code is one that was worth
 * something at the moment it was accepted. It is re-checked on every render
 * afterwards, because "worth something now" is not "worth something later": a
 * code can expire, run out of uses, or fall below its minimum when the shopper
 * removes an item, and in each case the cart quietly drops it rather than
 * showing a discount checkout will not honour.
 */
async function runApplyCouponCode(rawCode: string): Promise<CouponActionResult> {
  const code = normalizeCouponCode(rawCode)
  if (!code) return fail('יש להזין קוד קופון', 'VALIDATION')
  if (code.length > 64) return fail('קוד הקופון ארוך מדי', 'VALIDATION')

  const ip = await getClientIp()
  // Same limiter the cart writes use. Without one this endpoint is a code
  // oracle: unlimited guesses against a table of short codes.
  const allowed = await checkRateLimit(`coupon:${ip}`)
  if (!allowed) return fail('יותר מדי ניסיונות — נסו שוב מאוחר יותר', 'RATE_LIMITED')

  const { row } = await getCartRow()
  const items = parseItems(row?.items)
  if (items.length === 0) return fail('העגלה ריקה', 'EMPTY_CART')

  const { products, variants } = await loadCartProductData(items)
  const priced = buildCartView(row?.id ?? null, items, products, variants)

  // Site-wide campaign first, same precedence as resolveAppliedCoupon. Without
  // this the whole of 096 would be unreachable: a campaign code entered in the
  // cart would fall through to `public.coupons`, miss, and be rejected as
  // unknown.
  const campaign = await evaluateCampaignCode(code, priced)
  if (campaign) {
    const cookieStore = await cookies()
    cookieStore.set(CART_COUPON_COOKIE, campaign.code, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COUPON_COOKIE_MAX_AGE,
      path: '/',
    })
    revalidateCartPaths()
    return { ok: true, cart: await runGetCart() }
  }

  const { data } = await createPublicClient()
    .from('coupons')
    .select(
      'id, code, discount_type, discount_value, min_purchase, expires_at, is_active, max_uses, used_count, product_id',
    )
    .ilike('code', code)
    .maybeSingle()

  const evaluation = evaluateCoupon(
    (data as CouponRecord | null) ?? null,
    {
      payableAgorot: priced.subtotal,
      productIds: priced.items.map((item) => item.product_id),
    },
    new Date(),
  )
  if (!evaluation.ok) return fail(evaluation.message, 'COUPON_INVALID')

  const cookieStore = await cookies()
  cookieStore.set(CART_COUPON_COOKIE, evaluation.code, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COUPON_COOKIE_MAX_AGE,
    path: '/',
  })

  revalidateCartPaths()
  return {
    ok: true,
    cart: buildCartView(row?.id ?? null, items, products, variants, {
      code: evaluation.code,
      label: evaluation.label,
      discountAgorot: evaluation.discountAgorot,
    }),
  }
}

async function runRemoveCouponCode(): Promise<CouponActionResult> {
  const cookieStore = await cookies()
  cookieStore.delete(CART_COUPON_COOKIE)
  revalidateCartPaths()
  return { ok: true, cart: await runGetCart() }
}

/**
 * What checkout should actually take off the card, in agorot.
 *
 * Deliberately NOT read from the cart view the browser was shown. The cart is a
 * rendering; this is a fresh evaluation at the moment of charging, against the
 * cart as it stands then. Between the two the code can have expired, the cart
 * can have shrunk below the minimum, or the last use can have gone to someone
 * else.
 */
async function runResolveCheckoutDiscountAgorot(): Promise<{
  code: string | null
  discountAgorot: number
}> {
  const cart = await runGetCart()
  if (!cart.coupon) return { code: null, discountAgorot: 0 }
  // Already agorot. This used to multiply a shekel float back up by 100 and
  // round it, which is the round trip the whole cart is now built to avoid.
  return { code: cart.coupon.code, discountAgorot: cart.coupon.discount }
}

export async function getCart(): Promise<CartView> {
  return withActionContext('cart.get', () => runGetCart())
}

export async function addToCart(
  productId: string,
  variantId: string | null = null,
  quantity = 1,
): Promise<CartActionResult> {
  return withActionContext('cart.add', () => runAddToCart(productId, variantId, quantity))
}

export async function updateCartItem(
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<CartActionResult> {
  return withActionContext('cart.update_item', () =>
    runUpdateCartItem(productId, variantId, quantity),
  )
}

export async function removeFromCart(
  productId: string,
  variantId: string | null = null,
): Promise<CartActionResult> {
  return withActionContext('cart.remove_item', () => runRemoveFromCart(productId, variantId))
}

export async function clearCart(): Promise<CartActionResult> {
  return withActionContext('cart.clear', () => runClearCart())
}

export async function removeUnavailableItems(): Promise<CartActionResult> {
  return withActionContext('cart.remove_unavailable', () => runRemoveUnavailableItems())
}

/** True when the merge ran (or had nothing to merge); false when a read failed
 * and the caller must keep the guest cookie so it can be retried. */
export async function mergeGuestCart(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  return withActionContext('cart.merge_guest', () => runMergeGuestCart(supabase, userId, sessionId))
}

export async function clearGuestSessionCookie(): Promise<void> {
  return withActionContext('cart.clear_guest_cookie', () => runClearGuestSessionCookie())
}

export async function applyCouponCode(rawCode: string): Promise<CouponActionResult> {
  return withActionContext('cart.apply_coupon', () => runApplyCouponCode(rawCode))
}

export async function removeCouponCode(): Promise<CouponActionResult> {
  return withActionContext('cart.remove_coupon', () => runRemoveCouponCode())
}

export async function resolveCheckoutDiscountAgorot(): Promise<{
  code: string | null
  discountAgorot: number
}> {
  return withActionContext('cart.resolve_checkout_discount', () =>
    runResolveCheckoutDiscountAgorot(),
  )
}
