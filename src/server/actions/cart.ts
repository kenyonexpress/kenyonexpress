'use server'

import { type CouponRecord, evaluateCoupon, normalizeCouponCode } from '@/lib/cart/coupon'
import {
  GUEST_SESSION_COOKIE,
  ensureGuestSessionId,
  getGuestSessionId,
} from '@/lib/cart/guest-session'
import { buildCartView } from '@/lib/cart/pricing'
import type { CartActionResult, CartStorageItem, CartView } from '@/lib/cart/types'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  CASHBACK_PERCENT_CANDIDATES,
  COUPON_054_COLUMNS,
  type Coupon054Row,
  readFirstAvailableColumn,
  readOptionalColumns,
} from '@/lib/supabase/optional-columns'
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
  return raw.filter(
    (item): item is CartStorageItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as CartStorageItem).product_id === 'string' &&
      typeof (item as CartStorageItem).quantity === 'number',
  )
}

function expiresAt(): string {
  return new Date(Date.now() + CART_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

async function checkCartWriteRateLimit(userId: string | null): Promise<boolean> {
  if (userId) return checkRateLimit(`cart_write:user:${userId}`, 120, 3600)
  const ip = await getClientIp()
  return checkRateLimit(`cart_write:ip:${ip}`, 120, 3600)
}

async function loadProductData(items: CartStorageItem[]) {
  if (items.length === 0) return { products: [], variants: [] }

  const productIds = [...new Set(items.map((i) => i.product_id))]
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter((id): id is string => !!id))]

  const admin = createAdminClient()

  // No cashback column here, under either name. 059 renames cashback_percent
  // to cashback_bp and moves it to basis points, and it is NOT applied to the
  // hosted project. Naming the wrong one fails the WHOLE select with 42703:
  // `products` comes back null and every cart line loses its name, its image
  // and its price, while the header still shows a correct item count because
  // the count comes from the carts row rather than from here. That failure is
  // in STATE for 2026-07-28, where it was then "fixed" to the other name, which
  // is the same bug facing the other way. It is read below from whichever
  // column exists, and a cart is not worth losing over a perk that defaults to
  // zero.
  const productSelect =
    'id, slug, name_he, type, kenyon_price, stock_quantity, status, deleted_at, images, is_coupon_enabled, platform_percent'

  const { data: products } = await admin.from('products').select(productSelect).in('id', productIds)

  // coupon_price_ils arrives with migration 054, which is not applied to every
  // deployment. Naming it above would fail the whole cart query with 42703 and
  // leave the shopper with an empty cart rather than an unpriced coupon line.
  const coupon054 = await readOptionalColumns<Coupon054Row>(
    (select, ids) => admin.from('products').select(select).in('id', ids) as never,
    COUPON_054_COLUMNS,
    productIds,
    'cart',
  )
  const cashback = await readFirstAvailableColumn<number>(
    (select, ids) => admin.from('products').select(select).in('id', ids) as never,
    CASHBACK_PERCENT_CANDIDATES,
    productIds,
    'cart cashback',
  )

  const pricedProducts = (products ?? []).map((p) => ({
    ...p,
    coupon_price_ils: coupon054.get(p.id)?.coupon_price_ils ?? null,
    // Normalised to percent here rather than in pricing.ts, so the pure pricing
    // module keeps speaking percent, which is what its invariants are written
    // in. 250 bp is 2.5 percent.
    cashback_percent: cashback.get(p.id) ?? null,
  }))

  let variants: {
    id: string
    product_id: string
    price: number | null
    price_modifier: number
    stock_quantity: number | null
    is_active: boolean
    deleted_at: string | null
  }[] = []

  if (variantIds.length > 0) {
    const { data } = await admin
      .from('product_variants')
      .select('id, product_id, price, price_modifier, stock_quantity, is_active, deleted_at')
      .in('id', variantIds)
    variants = data ?? []
  }

  return { products: pricedProducts, variants }
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

  const admin = createAdminClient()
  const { data } = await admin
    .from('coupons')
    .select(
      'id, code, discount_type, discount_value, min_purchase, expires_at, is_active, max_uses, used_count, product_id',
    )
    .ilike('code', code)
    .maybeSingle()

  const evaluation = evaluateCoupon(
    (data as CouponRecord | null) ?? null,
    {
      payableAgorot: Math.round(view.subtotal * 100),
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
  const { products, variants } = await loadProductData(items)
  const priced = buildCartView(cartId, items, products, variants)
  if (priced.items.length === 0) return priced
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
    const { data } = await supabase
      .from('carts')
      .select('id, items')
      .eq('profile_id', user.id)
      .maybeSingle()
    return { row: data, isGuest: false, userId: user.id }
  }

  const sessionId = (await getGuestSessionId()) ?? (await ensureGuestSessionId())
  const admin = createAdminClient()
  const { data } = await admin
    .from('carts')
    .select('id, items')
    .eq('session_id', sessionId)
    .is('profile_id', null)
    .maybeSingle()

  return { row: data, isGuest: true, userId: null }
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
    const admin = createAdminClient()

    if (existingId) {
      const { data, error } = await admin
        .from('carts')
        .update({ items, expires_at: expiry })
        .eq('id', existingId)
        .select('id, items')
        .single()
      if (error) throw error
      return data
    }

    const { data, error } = await admin
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

async function validateProductForCart(
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const admin = createAdminClient()

  const { data: product } = await admin
    .from('products')
    .select('id, status, deleted_at, stock_quantity, type, is_coupon_enabled')
    .eq('id', productId)
    .maybeSingle()

  if (!product || product.status !== 'active' || product.deleted_at) {
    return { ok: false, error: 'המוצר לא זמין', code: 'NOT_FOUND' }
  }

  if (variantId) {
    const { data: variant } = await admin
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
    return { ok: true }
  }

  const stock = product.stock_quantity
  if (stock != null && stock < quantity) {
    return { ok: false, error: 'אין מספיק במלאי', code: 'INSUFFICIENT_STOCK' }
  }

  return { ok: true }
}

function revalidateCartPaths() {
  revalidatePath('/cart')
  revalidatePath('/', 'layout')
}

function fail(error: string, code: string): CartActionResult {
  return { ok: false, error, code }
}

export async function getCart(): Promise<CartView> {
  const { row } = await getCartRow()
  const items = parseItems(row?.items)
  return resolveCartView(row?.id ?? null, items)
}

export async function addToCart(
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

  const nextItems = existing
    ? items.map((i) => (itemKey(i) === key ? { ...i, quantity: nextQty } : i))
    : [...items, { ...parsed.data, quantity: nextQty }]

  const saved = await saveCartItems(nextItems, isGuest, userId, row?.id ?? null)
  const cart = await resolveCartView(saved.id, parseItems(saved.items))
  revalidateCartPaths()
  return { ok: true, cart }
}

export async function updateCartItem(
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

export async function removeFromCart(
  productId: string,
  variantId: string | null = null,
): Promise<CartActionResult> {
  return updateCartItem(productId, variantId, 0)
}

export async function clearCart(): Promise<CartActionResult> {
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

export async function mergeGuestCart(userId: string, sessionId: string): Promise<void> {
  const admin = createAdminClient()

  const [{ data: guestCart }, { data: userCart }] = await Promise.all([
    admin
      .from('carts')
      .select('id, items')
      .eq('session_id', sessionId)
      .is('profile_id', null)
      .maybeSingle(),
    admin.from('carts').select('id, items').eq('profile_id', userId).maybeSingle(),
  ])

  if (!guestCart || !Array.isArray(guestCart.items) || guestCart.items.length === 0) return

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
      ? admin.from('carts').update({ items: mergedItems }).eq('id', userCart.id)
      : admin.from('carts').insert({ profile_id: userId, items: mergedItems }),
    admin.from('carts').delete().eq('id', guestCart.id),
  ])
}

export async function clearGuestSessionCookie(): Promise<void> {
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
export async function applyCouponCode(rawCode: string): Promise<CouponActionResult> {
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

  const { products, variants } = await loadProductData(items)
  const priced = buildCartView(row?.id ?? null, items, products, variants)

  const admin = createAdminClient()
  const { data } = await admin
    .from('coupons')
    .select(
      'id, code, discount_type, discount_value, min_purchase, expires_at, is_active, max_uses, used_count, product_id',
    )
    .ilike('code', code)
    .maybeSingle()

  const evaluation = evaluateCoupon(
    (data as CouponRecord | null) ?? null,
    {
      payableAgorot: Math.round(priced.subtotal * 100),
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

export async function removeCouponCode(): Promise<CouponActionResult> {
  const cookieStore = await cookies()
  cookieStore.delete(CART_COUPON_COOKIE)
  revalidateCartPaths()
  return { ok: true, cart: await getCart() }
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
export async function resolveCheckoutDiscountAgorot(): Promise<{
  code: string | null
  discountAgorot: number
}> {
  const cart = await getCart()
  if (!cart.coupon) return { code: null, discountAgorot: 0 }
  return { code: cart.coupon.code, discountAgorot: Math.round(cart.coupon.discount * 100) }
}
