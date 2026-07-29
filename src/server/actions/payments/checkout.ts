'use server'

import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'
import { validateCartView } from '@/lib/checkout/validate-cart'
import { agorot, agorotToIls, ilsToAgorot } from '@/lib/commerce/money'
import {
  type SupplierIdentity,
  buildOrderItemSnapshot,
  completeSplitPair,
} from '@/lib/commerce/product-money'
import { capturePaymentError } from '@/lib/observability/sentry'
import {
  type PaymentProvider,
  getCardcomAccounts,
  getPaymentProvider,
  loadCardcomEnv,
} from '@/lib/payments'
import { isCardTokenExpired } from '@/lib/payments/token-expiry'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import {
  type BeginCheckoutOutput,
  type CheckoutActionResult,
  beginCheckoutInputSchema,
} from '@/lib/validations/checkout'
import { getCart } from '@/server/actions/cart'
import {
  linkAnalyticsIdentity,
  stampOrderAttribution,
  trackServerEvent,
} from '@/server/analytics/track'
import { type SettlementLineInput, calculateSettlement } from '@/server/domain/orders/settlement'
import { finalizeOrder } from '@/server/payments/finalize'
import { redirect } from 'next/navigation'

const ORDER_EXPIRY_MINUTES = 30

type SettlementProductRow = {
  id: string
  type: string
  is_coupon_enabled: boolean | null
  supplier_id: string | null
  platform_percent: number | null
  supplier_split_percent: number | null
  discount_percent: number | null
  coupon_price_ils: number | null
  cashback_percent: number | null
}

/**
 * Supplier identity as it stands at purchase. Read here and copied onto the
 * order line by value, never joined back to at read time: an order has to keep
 * naming the business it was bought from after that business is renamed, moves,
 * or changes its logo.
 */
type SnapshotSupplierRow = {
  id: string
  name: string | null
  contact_phone: string | null
  address: string | null
  logo_url: string | null
}

/**
 * Maps the supplier row onto the shape product-money snapshots from. Returns an
 * id-only identity when the supplier row is missing rather than throwing: the
 * publish gate is what guarantees these fields are filled, and a checkout must
 * not fail on a detail that only affects how the order is later displayed.
 */
function supplierIdentityOf(
  product: SettlementProductRow,
  suppliers: Map<string, SnapshotSupplierRow>,
): SupplierIdentity {
  const row = product.supplier_id ? suppliers.get(product.supplier_id) : undefined
  return {
    id: product.supplier_id,
    name: row?.name ?? null,
    phone: row?.contact_phone ?? null,
    address: row?.address ?? null,
    logoUrl: row?.logo_url ?? null,
  }
}

/**
 * Charges a saved card token and finalizes in one server-to-server call. No
 * hosted page, so no redirect and no webhook: the charge response IS the
 * outcome, and `finalizeOrder` runs inline with the transaction id it returned.
 *
 * The token decides the account, not the platform default. Cardcom will not
 * charge a token on a terminal other than the one that minted it, and the
 * decline it returns for that says nothing about why.
 *
 * A decline leaves the order `pending` on purpose rather than cancelling it:
 * the customer is still on the checkout page and the ordinary next move is to
 * try another card, which reuses this same order.
 */
async function chargeSavedToken(args: {
  admin: ReturnType<typeof createAdminClient>
  tokenId: string
  userId: string
  orderId: string
  amountAgorot: ReturnType<typeof agorot>
  walletAppliedAgorot: ReturnType<typeof agorot>
  idempotencyKey: string
  now: Date
}): Promise<CheckoutActionResult<BeginCheckoutOutput>> {
  const { admin, tokenId, userId, orderId, amountAgorot, walletAppliedAgorot, now } = args

  const { data: token } = await admin
    .from('payment_tokens')
    .select('id, cardcom_token, cardcom_account_id, expiry_month, expiry_year, profile_id')
    .eq('id', tokenId)
    .maybeSingle()
  // Ownership is checked here rather than by RLS because this runs on the admin
  // client: a token id from another account must not be chargeable by guessing.
  if (!token || token.profile_id !== userId) {
    return { ok: false, error: 'הכרטיס השמור לא נמצא', code: 'NOT_FOUND' }
  }

  // Cardcom would decline an expired card anyway; refusing here keeps a
  // pointless decline off the customer's record and out of the terminal's.
  if (isCardTokenExpired(token.expiry_month, token.expiry_year, now)) {
    return { ok: false, error: 'תוקף הכרטיס השמור פג', code: 'VALIDATION' }
  }

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      order_id: orderId,
      kind: 'charge',
      status: 'initiated',
      amount_ils: agorotToIls(amountAgorot),
      currency: 'ILS',
      wallet_applied_ils: agorotToIls(walletAppliedAgorot),
      idempotency_key: args.idempotencyKey,
      cardcom_account_id: token.cardcom_account_id,
    })
    .select('id')
    .single()
  if (paymentError || !payment) {
    return { ok: false, error: `יצירת תשלום נכשלה: ${paymentError?.message}`, code: 'INTERNAL' }
  }

  let charged: Awaited<ReturnType<PaymentProvider['chargeWithToken']>>
  try {
    const provider = getPaymentProvider(token.cardcom_account_id)
    charged = await provider.chargeWithToken({
      paymentId: payment.id,
      orderId,
      amountAgorot,
      cardcomToken: token.cardcom_token,
      description: `הזמנה ${orderId.slice(0, 8)}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'payment provider error'
    await admin
      .from('payments')
      .update({ status: 'failed', failure_message: message, failed_at: now.toISOString() })
      .eq('id', payment.id)
    capturePaymentError(error, {
      stage: 'charge_saved_token',
      orderId,
      paymentId: payment.id,
      detail: { message },
    })
    return { ok: false, error: 'שגיאה בחיבור לספק הסליקה', code: 'PAYMENT_PROVIDER_ERROR' }
  }

  if (!charged.success) {
    await admin
      .from('payments')
      .update({
        status: 'failed',
        failure_code: charged.failureCode,
        failure_message: charged.failureMessage,
        failed_at: now.toISOString(),
      })
      .eq('id', payment.id)
    return {
      ok: false,
      error: charged.failureMessage ?? 'החיוב נדחה',
      code: 'PAYMENT_PROVIDER_ERROR',
    }
  }

  const finalized = await finalizeOrder({
    orderId,
    paymentId: payment.id,
    transactionId: charged.transactionId,
    now,
  })
  if (!finalized.ok) {
    return { ok: false, error: finalized.error, code: 'INTERNAL' }
  }
  return { ok: true, data: { kind: 'paid', order_id: orderId } }
}

/**
 * Creates the pending order snapshot and hands off to the payment provider.
 * Money amounts are computed server-side only; the client contributes ids and
 * consent, never prices.
 */
export async function beginCheckout(
  rawInput: unknown,
): Promise<CheckoutActionResult<BeginCheckoutOutput>> {
  const env = loadCardcomEnv()
  if (!env.checkoutEnabled) {
    return { ok: false, error: 'התשלום מושבת כרגע, נסו שוב מאוחר יותר', code: 'CHECKOUT_DISABLED' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'יש להתחבר לפני התשלום', code: 'UNAUTHENTICATED' }
  }

  const allowed = await checkRateLimit(`begin_checkout:user:${user.id}`, 10, 60)
  if (!allowed) {
    return { ok: false, error: 'יותר מדי ניסיונות תשלום, המתינו דקה', code: 'RATE_LIMITED' }
  }

  const parsed = beginCheckoutInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'נתוני תשלום לא תקינים',
      code: 'VALIDATION',
    }
  }
  const input = parsed.data

  // 1. Server-built cart + gate
  const cart = await getCart()
  const validation = validateCartView(cart)
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.issues[0]?.message ?? 'העגלה אינה תקינה',
      code: 'VALIDATION',
    }
  }
  if (validation.requiresAddress && !input.address_id) {
    return { ok: false, error: 'נדרשת כתובת למשלוח', code: 'ADDRESS_REQUIRED' }
  }

  const admin = createAdminClient()

  if (input.address_id) {
    const { data: address } = await admin
      .from('user_addresses')
      .select('id, user_id')
      .eq('id', input.address_id)
      .maybeSingle()
    if (!address || address.user_id !== user.id) {
      return { ok: false, error: 'כתובת לא תקינה', code: 'ADDRESS_REQUIRED' }
    }
  }

  // 2. Idempotent replay by client_ref
  const idempotencyKey = `lp:${input.client_ref}`
  const { data: existingPayment } = await admin
    .from('payments')
    .select('id, order_id, status, raw_response')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existingPayment) {
    const raw = existingPayment.raw_response as { redirect_url?: string } | null
    if (
      (existingPayment.status === 'initiated' || existingPayment.status === 'redirected') &&
      raw?.redirect_url
    ) {
      return {
        ok: true,
        data: {
          kind: 'redirect',
          order_id: existingPayment.order_id,
          redirect_url: raw.redirect_url,
        },
      }
    }
    if (existingPayment.status === 'succeeded') {
      return { ok: true, data: { kind: 'paid', order_id: existingPayment.order_id } }
    }
    return { ok: false, error: 'בקשת תשלום כפולה', code: 'IDEMPOTENT_REPLAY' }
  }

  // 3. Settlement snapshot from product rows (never from the client)
  const productIds = [...new Set(cart.items.map((i) => i.product_id))]
  const { data: productRows } = await admin
    .from('products')
    .select(
      'id, type, is_coupon_enabled, supplier_id, platform_percent, supplier_split_percent, discount_percent, coupon_price_ils, cashback_percent',
    )
    .in('id', productIds)
  const productMap = new Map<string, SettlementProductRow>(
    (productRows ?? []).map((p) => [p.id, p as unknown as SettlementProductRow]),
  )

  // Supplier identity for the snapshot. Loaded in one round trip keyed by the
  // supplier ids the cart's products point at.
  const supplierIds = [
    ...new Set(
      (productRows ?? [])
        .map((p) => (p as unknown as SettlementProductRow).supplier_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ]
  const { data: supplierRows } = await admin
    .from('suppliers')
    .select('id, name, contact_phone, address, logo_url')
    .in('id', supplierIds.length > 0 ? supplierIds : ['00000000-0000-0000-0000-000000000000'])
  const supplierMap = new Map<string, SnapshotSupplierRow>(
    (supplierRows ?? []).map((s) => [s.id, s as unknown as SnapshotSupplierRow]),
  )

  const settlementLines: SettlementLineInput[] = []
  for (const item of cart.items) {
    const product = productMap.get(item.product_id)
    if (!product) {
      return { ok: false, error: 'מוצר בעגלה אינו קיים עוד', code: 'NOT_FOUND' }
    }
    if (!product.supplier_id) {
      return { ok: false, error: `למוצר "${item.name_he}" אין ספק משויך`, code: 'INTERNAL' }
    }
    // Final rules (docs/ADMIN-ARCHITECTURE.md section 0): the split pair is
    // required on BOTH types, and a coupon line also needs the admin-set
    // ABSOLUTE coupon price. No defaults exist for any of them: a product
    // missing a mandatory value cannot be sold, and inventing one here would
    // move money that belongs to someone else.
    //
    // completeSplitPair fills in whichever half the product is missing. That
    // matters in practice rather than in theory: all 61 live products carry
    // supplier_split_percent and none carried platform_percent before
    // migration 070 backfilled it.
    const split = completeSplitPair({
      platformPercent: product.platform_percent,
      supplierSplitPercent: product.supplier_split_percent,
    })
    if (!split.ok) {
      return {
        ok: false,
        error: `למוצר "${item.name_he}" לא הוגדר פיצול עמלה: ${split.message}`,
        code: 'INTERNAL',
      }
    }

    if (item.type === 'coupon') {
      const couponPrice = Number(product.coupon_price_ils ?? 0)
      if (!(couponPrice > 0)) {
        return {
          ok: false,
          error: `למוצר "${item.name_he}" לא הוגדר מחיר קופון`,
          code: 'INTERNAL',
        }
      }
      settlementLines.push({
        id: `${item.product_id}::${item.variant_id ?? 'null'}`,
        productType: item.type,
        unitPrice: ilsToAgorot(item.unit_price.toFixed(2)),
        quantity: item.quantity,
        couponPriceUnit: ilsToAgorot(couponPrice.toFixed(2)),
        platformPercent: split.pair.platformPercent,
        cashbackPercent: product.cashback_percent ?? 0,
      })
    } else {
      settlementLines.push({
        id: `${item.product_id}::${item.variant_id ?? 'null'}`,
        productType: item.type,
        unitPrice: ilsToAgorot(item.unit_price.toFixed(2)),
        quantity: item.quantity,
        platformPercent: split.pair.platformPercent,
        cashbackPercent: product.cashback_percent ?? 0,
      })
    }
  }

  // Wallet: cap at balance and at the on-site charge
  let walletAppliedAgorot = agorot(0)
  if (input.apply_wallet_ils > 0) {
    const { data: account } = await admin
      .from('wallet_accounts')
      .select('id, balance_ils')
      .eq('user_id', user.id)
      .maybeSingle()
    const balance = Number(account?.balance_ils ?? 0)
    if (input.apply_wallet_ils > balance) {
      return { ok: false, error: 'יתרת הארנק אינה מספיקה', code: 'INSUFFICIENT_WALLET' }
    }
    walletAppliedAgorot = ilsToAgorot(input.apply_wallet_ils.toFixed(2))
  }

  let settlement: ReturnType<typeof calculateSettlement>
  try {
    settlement = calculateSettlement({
      idempotencyKey: input.client_ref,
      lines: settlementLines,
      walletApplied: walletAppliedAgorot,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'settlement failed'
    return { ok: false, error: message, code: 'VALIDATION' }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + ORDER_EXPIRY_MINUTES * 60 * 1000)

  // 4. Pending order + items snapshot
  //
  // Every money column here is integer agorot. 059 renamed the whole set
  // (subtotal_ils -> subtotal_agorot, total_ils -> total_agorot, ...) and left
  // the originals behind as *_ils_legacy. Writing the old names produced
  // PGRST204 on the very first statement of a checkout, so NO ORDER COULD BE
  // CREATED AT ALL against a 059 database; three of the agorot columns are also
  // NOT NULL with no default, so the row would have been rejected even if the
  // names had resolved.
  //
  // wallet_applied_agorot and cashback_applied_agorot are the same number by
  // construction: 042 derived the first from cashback_applied_ils and 059 then
  // renamed that same column into the second. Both are written so a reader
  // cannot pick the one that happens to be empty.
  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      user_id: user.id,
      status: 'pending',
      subtotal_agorot: settlement.faceValue,
      discount_agorot: 0,
      wallet_applied_agorot: settlement.walletApplied,
      cashback_applied_agorot: settlement.walletApplied,
      customer_pays_now_agorot: settlement.paidOnSite,
      total_agorot: settlement.paidOnSite,
      currency: 'ILS',
      address_id: input.address_id,
      accepted_terms_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()
  if (orderError || !order) {
    return { ok: false, error: `יצירת הזמנה נכשלה: ${orderError?.message}`, code: 'INTERNAL' }
  }

  const itemRows = cart.items.map((item) => {
    const line = settlement.lines.find(
      (l) => l.id === `${item.product_id}::${item.variant_id ?? 'null'}`,
    )
    if (!line) throw new Error('settlement line missing for cart item')
    const product = productMap.get(item.product_id)
    if (!product) throw new Error('product row missing for cart item')

    /**
     * Snapshot semantics (docs/ADMIN-ARCHITECTURE.md section 0.4). Every value
     * here is COPIED, never referenced. Editing the product or the supplier
     * afterwards must not move this row: a line bought at 70/30 keeps reading
     * 70/30 after the product moves to 85/15, and the order keeps naming the
     * business it was bought from after that business is renamed.
     *
     * The hardcoded 100 that used to sit on coupon lines is gone. It recorded a
     * rule rather than a fact, so every coupon order in the table claimed the
     * platform took everything regardless of what the admin had configured.
     */
    const snapshot = buildOrderItemSnapshot({
      type: line.productType,
      platformPercent: product.platform_percent,
      supplierSplitPercent: product.supplier_split_percent,
      discountPercent: product.discount_percent,
      couponPriceIls: product.coupon_price_ils,
      supplier: supplierIdentityOf(product, supplierMap),
    })

    return {
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_type: item.type,
      supplier_id: product.supplier_id ?? null,
      quantity: item.quantity,
      // Post-059 column names throughout. The percent columns became basis
      // points in the same migration (platform_percent -> platform_bp), which
      // is why billedPercent is multiplied by 100 rather than renamed: 30% is
      // 3000 bp, and writing 30 into a bp column understates the platform's
      // take by two orders of magnitude on every row.
      unit_price_agorot: ilsToAgorot(item.unit_price),
      total_price_agorot: line.faceValue,
      face_value_agorot: line.faceValue,
      customer_pays_now_agorot: line.paidOnSite,
      paid_on_site_agorot: line.paidOnSite,
      charged_on_site_agorot: line.paidOnSite,
      platform_fee_agorot: line.commission,
      commission_agorot: line.commission,
      supplier_due_agorot: line.supplierDue,
      supplier_immediate_agorot: line.supplierDue,
      supplier_payout_agorot: line.supplierDue,
      balance_due_agorot: line.balanceDueAtBusiness,
      balance_due_at_business_agorot: line.balanceDueAtBusiness,
      cashback_amount_agorot: line.cashbackAmount,
      cashback_earned_agorot: line.cashbackAmount,
      platform_bp: line.platformPercentBps,
      commission_bp: line.platformPercentBps,
      upfront_bp: line.platformPercentBps,
      commission_snapshot_bp: line.platformPercentBps,
      cashback_bp: 0,
      supplier_split_percent: snapshot.supplier_split_percent,
      discount_percent: snapshot.discount_percent,
      coupon_price_ils: snapshot.coupon_price_ils,
      supplier_name: snapshot.supplier_name,
      supplier_phone: snapshot.supplier_phone,
      supplier_address: snapshot.supplier_address,
      supplier_logo_url: snapshot.supplier_logo_url,
      item_status: 'pending' as const,
      settlement_status: 'pending' as const,
      // Legacy 046/047 shape. Always 0: there is no escrow, and "held" was only
      // ever a flag in our own ledger.
      escrow_held_agorot: 0,
      escrow_release_agorot: 0,
    }
  })
  const { error: itemsError } = await admin.from('order_items').insert(itemRows)
  if (itemsError) {
    await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    return { ok: false, error: `שמירת פריטי הזמנה נכשלה: ${itemsError.message}`, code: 'INTERNAL' }
  }

  // Analytics: the order now exists, so this is the real "checkout started"
  // moment. All three calls swallow their own errors; none can fail a checkout.
  await stampOrderAttribution(order.id)
  await linkAnalyticsIdentity(user.id)
  await trackServerEvent({
    eventName: 'begin_checkout',
    userId: user.id,
    path: '/checkout',
    props: {
      order_id: order.id,
      items_count: cart.items.length,
      cart_total_ils: agorotToIls(settlement.faceValue),
    },
  })

  // 5. Wallet covers everything: finalize without a provider round-trip
  if (settlement.cardCharge === 0) {
    const finalized = await finalizeOrder({
      orderId: order.id,
      paymentId: null,
      transactionId: null,
      now,
    })
    if (!finalized.ok) {
      return { ok: false, error: finalized.error, code: 'INTERNAL' }
    }
    return { ok: true, data: { kind: 'paid', order_id: order.id } }
  }

  // 5b. Saved card: charge the stored token server-to-server, no hosted page.
  // `token_id` has been in the input schema since checkout was written and was
  // never read, so a customer with a saved card was still sent through the full
  // redirect every time.
  if (input.token_id) {
    return await chargeSavedToken({
      admin,
      tokenId: input.token_id,
      userId: user.id,
      orderId: order.id,
      amountAgorot: settlement.cardCharge,
      walletAppliedAgorot: settlement.walletApplied,
      idempotencyKey,
      now,
    })
  }

  // 6. Payment row + hosted page.
  // The account is recorded before the hosted page exists, because the Low
  // Profile id it returns is only meaningful on this account's terminal: a
  // later GetLpResult or refund has to know where to ask.
  const account = getCardcomAccounts().platform
  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      order_id: order.id,
      kind: 'charge',
      status: 'initiated',
      amount_agorot: settlement.cardCharge,
      currency: 'ILS',
      wallet_applied_agorot: settlement.walletApplied,
      idempotency_key: idempotencyKey,
      cardcom_account_id: account.id,
    })
    .select('id')
    .single()
  if (paymentError || !payment) {
    return { ok: false, error: `יצירת תשלום נכשלה: ${paymentError?.message}`, code: 'INTERNAL' }
  }

  try {
    const provider = getPaymentProvider(account.id)
    const created = await provider.createLowProfile({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.id.slice(0, 8).toUpperCase(),
      amountAgorot: settlement.cardCharge,
      saveToken: input.save_card,
      successRedirectUrl: `${env.appUrl}/checkout/return?order_id=${order.id}`,
      failedRedirectUrl: `${env.appUrl}/checkout/failed?order_id=${order.id}`,
      // Cardcom does not sign webhooks; the unguessable secret in the URL is the
      // authenticity gate (paired with server-side GetLpResult re-verification).
      webhookUrl: `${env.appUrl}/api/payments/cardcom/webhook?s=${encodeURIComponent(env.webhookSecret)}`,
      description: `הזמנה ${order.id.slice(0, 8)}`,
    })

    await admin
      .from('payments')
      .update({
        status: 'redirected',
        cardcom_low_profile_id: created.lowProfileId,
        raw_response: { ...created.raw, redirect_url: created.redirectUrl },
      })
      .eq('id', payment.id)

    return {
      ok: true,
      data: { kind: 'redirect', order_id: order.id, redirect_url: created.redirectUrl },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'payment provider error'
    await admin
      .from('payments')
      .update({ status: 'failed', failure_message: message, failed_at: new Date().toISOString() })
      .eq('id', payment.id)
    // A declined card is ordinary; the provider being unreachable is not, and
    // it stops every checkout at once.
    capturePaymentError(error, {
      stage: 'create_low_profile',
      orderId: order.id,
      paymentId: payment.id,
      detail: { message },
    })
    return { ok: false, error: 'שגיאה בחיבור לספק הסליקה', code: 'PAYMENT_PROVIDER_ERROR' }
  }
}

export type CheckoutFormState = { error: string } | null

/**
 * Form-facing wrapper: optionally persists a shipping address, then runs
 * beginCheckout and redirects to the provider / return page.
 */
export async function submitCheckout(
  _prev: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר לפני התשלום' }

  const text = (name: string) => {
    const v = formData.get(name)
    return typeof v === 'string' ? v.trim() : ''
  }

  let addressId: string | null = text('address_id') || null
  const needsAddress = text('needs_address') === 'true'

  if (needsAddress && !addressId) {
    const city = text('city')
    const street = text('street')
    const streetNumber = text('street_number')
    // The form splits the name in two to match the live checkout; the address
    // table stores one. Falling back to full_name keeps any caller that still
    // posts the single field working.
    const fullName =
      [text('first_name'), text('last_name')].filter(Boolean).join(' ') || text('full_name')
    const phone = text('phone')
    if (!city || !street || !streetNumber || !fullName) {
      return { error: 'יש למלא שם, עיר, רחוב ומספר בית למשלוח' }
    }
    // The postal code is optional here exactly as it is on the form, but a
    // present one is checked on the server too: the client check is a courtesy
    // to the shopper, not a guarantee about what reached this action.
    const zipCheck = checkOptionalIsraeliPostalCode(text('zip'))
    if (zipCheck && !zipCheck.ok) return { error: zipCheck.message }

    const admin = createAdminClient()
    const { data: created, error: addressError } = await admin
      .from('user_addresses')
      .insert({
        user_id: user.id,
        full_name: fullName,
        phone: phone || null,
        city,
        street,
        street_number: streetNumber,
        apartment: text('apartment') || null,
        floor: text('floor') || null,
        notes_for_courier: text('order_notes') || null,
        zip: zipCheck?.ok ? zipCheck.normalized : null,
        is_default: true,
      })
      .select('id')
      .single()
    if (addressError || !created) {
      return { error: 'שמירת הכתובת נכשלה, נסו שוב' }
    }
    addressId = created.id
  }

  // 'new' is the radio value for "charge a fresh card", which is the hosted
  // page. Anything else is a saved token id, and beginCheckout re-checks that
  // it belongs to this user before charging it.
  const tokenChoice = text('token_id')
  const savedTokenId = tokenChoice && tokenChoice !== 'new' ? tokenChoice : undefined

  const result = await beginCheckout({
    client_ref: text('client_ref'),
    accept_terms: formData.get('accept_terms') === 'on',
    apply_wallet_ils: text('apply_wallet_ils') || 0,
    // Saving is a hosted-page operation; charging an existing token cannot mint
    // another one, so the checkbox is meaningless on that path.
    save_card: savedTokenId ? false : formData.get('save_card') === 'on',
    address_id: addressId,
    token_id: savedTokenId,
  })

  if (!result.ok) return { error: result.error }

  if (result.data.kind === 'paid') {
    redirect(`/checkout/return?order_id=${result.data.order_id}`)
  }
  redirect(result.data.redirect_url)
}

export type ReturnReconcileResult =
  | { status: 'paid'; order_id: string }
  | { status: 'pending'; order_id: string; reason?: string }
  | { status: 'failed'; order_id: string; reason?: string }
  | { status: 'not_found' }

/**
 * Called from /checkout/return. The redirect itself is cosmetic; payment truth
 * comes only from a server-to-server verify against the provider (same rules
 * as the webhook), then the idempotent finalize.
 */
export async function reconcileOrderReturn(orderId: string): Promise<ReturnReconcileResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'not_found' }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, status, paid_at')
    .eq('id', orderId)
    .maybeSingle()
  if (!order || order.user_id !== user.id) return { status: 'not_found' }
  if (order.paid_at || order.status === 'paid') return { status: 'paid', order_id: order.id }
  if (order.status !== 'pending') {
    return { status: 'failed', order_id: order.id, reason: `order ${order.status}` }
  }

  const { data: payment } = await admin
    .from('payments')
    .select('id, status, amount_agorot, cardcom_low_profile_id, cardcom_account_id')
    .eq('order_id', order.id)
    .eq('kind', 'charge')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!payment) {
    return { status: 'pending', order_id: order.id }
  }
  if (payment.status === 'succeeded') return { status: 'paid', order_id: order.id }
  if (payment.status === 'failed') return { status: 'failed', order_id: order.id }
  if (!payment.cardcom_low_profile_id) return { status: 'pending', order_id: order.id }

  // Verify against the terminal that issued this Low Profile id; any other one
  // reports not_found for a payment that may well have gone through.
  const provider = getPaymentProvider(payment.cardcom_account_id)
  const verified = await provider.verifyLowProfile(payment.cardcom_low_profile_id)
  if (!verified.success || verified.amountAgorot === null) {
    await admin
      .from('payments')
      .update({ status: 'failed', failed_at: new Date().toISOString() })
      .eq('id', payment.id)
      .in('status', ['initiated', 'redirected'])
    return { status: 'failed', order_id: order.id, reason: 'verification failed' }
  }

  // The stored amount IS agorot since 059. Multiplying it by 100 again, as this
  // did while reading amount_ils, compared a charge against a hundred times
  // itself and failed every verification as "amount mismatch".
  const expectedAgorot = Number(payment.amount_agorot)
  if (verified.amountAgorot !== expectedAgorot) {
    return { status: 'pending', order_id: order.id, reason: 'amount mismatch' }
  }

  const finalized = await finalizeOrder({
    orderId: order.id,
    paymentId: payment.id,
    transactionId: verified.transactionId,
    token: verified.token,
  })
  if (!finalized.ok) {
    return { status: 'pending', order_id: order.id, reason: finalized.error }
  }
  return { status: 'paid', order_id: order.id }
}
