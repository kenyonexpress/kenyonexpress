'use server'

import { validateCartView } from '@/lib/checkout/validate-cart'
import { agorot, agorotToIls, ilsToAgorot } from '@/lib/commerce/money'
import { getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
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
  DEFAULT_COUPON_UPFRONT_PERCENT,
  DEFAULT_PLATFORM_COMMISSION_PERCENT,
  type SettlementLineInput,
  calculateSettlement,
} from '@/server/domain/orders/settlement'
import { finalizeOrder } from '@/server/payments/finalize'

const ORDER_EXPIRY_MINUTES = 30

type SettlementProductRow = {
  id: string
  type: string
  is_coupon_enabled: boolean | null
  supplier_id: string | null
  platform_percent: number | null
  commission_percent: number | null
  cashback_percent: number | null
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
      .from('addresses')
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
      'id, type, is_coupon_enabled, supplier_id, platform_percent, commission_percent, cashback_percent',
    )
    .in('id', productIds)
  const productMap = new Map<string, SettlementProductRow>(
    (productRows ?? []).map((p) => [p.id, p as SettlementProductRow]),
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
    settlementLines.push({
      id: `${item.product_id}::${item.variant_id ?? 'null'}`,
      productType: item.type,
      unitPrice: ilsToAgorot(item.unit_price.toFixed(2)),
      quantity: item.quantity,
      upfrontPercent: product.platform_percent ?? DEFAULT_COUPON_UPFRONT_PERCENT,
      commissionPercent: product.commission_percent ?? DEFAULT_PLATFORM_COMMISSION_PERCENT,
      cashbackPercent: product.cashback_percent ?? 0,
    })
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
  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      user_id: user.id,
      status: 'pending',
      subtotal_ils: agorotToIls(settlement.faceValue),
      discount_ils: 0,
      cashback_applied_ils: agorotToIls(settlement.walletApplied),
      total_ils: agorotToIls(settlement.paidOnSite),
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
    return {
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_type: item.type,
      supplier_id: product?.supplier_id ?? null,
      quantity: item.quantity,
      unit_price_ils: item.unit_price,
      total_price_ils: agorotToIls(line.faceValue),
      platform_percent: line.upfrontBps / 100,
      commission_percent: line.commissionBps / 100,
      cashback_percent: 0,
      item_status: 'pending' as const,
      settlement_status: 'pending' as const,
      upfront_percent: line.upfrontBps / 100,
      commission_percent_snapshot: line.commissionBps / 100,
      face_value_agorot: line.faceValue,
      paid_on_site_agorot: line.paidOnSite,
      commission_agorot: line.commission,
      supplier_immediate_agorot: line.supplierImmediate,
      escrow_held_agorot: line.escrowHeld,
      escrow_release_agorot: line.escrowReleaseToSupplier,
      balance_due_agorot: line.balanceDueAtBusiness,
      cashback_amount_agorot: line.cashbackAmount,
    }
  })
  const { error: itemsError } = await admin.from('order_items').insert(itemRows)
  if (itemsError) {
    await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    return { ok: false, error: `שמירת פריטי הזמנה נכשלה: ${itemsError.message}`, code: 'INTERNAL' }
  }

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

  // 6. Payment row + hosted page
  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      order_id: order.id,
      kind: 'charge',
      status: 'initiated',
      amount_ils: agorotToIls(settlement.cardCharge),
      currency: 'ILS',
      wallet_applied_ils: agorotToIls(settlement.walletApplied),
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single()
  if (paymentError || !payment) {
    return { ok: false, error: `יצירת תשלום נכשלה: ${paymentError?.message}`, code: 'INTERNAL' }
  }

  try {
    const provider = getPaymentProvider()
    const created = await provider.createLowProfile({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.id.slice(0, 8).toUpperCase(),
      amountAgorot: settlement.cardCharge,
      saveToken: input.save_card,
      successRedirectUrl: `${env.appUrl}/checkout/return?order_id=${order.id}`,
      failedRedirectUrl: `${env.appUrl}/checkout/failed?order_id=${order.id}`,
      webhookUrl: `${env.appUrl}/api/payments/cardcom/webhook`,
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
    return { ok: false, error: 'שגיאה בחיבור לספק הסליקה', code: 'PAYMENT_PROVIDER_ERROR' }
  }
}
