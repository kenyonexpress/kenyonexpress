'use server'

import { randomUUID } from 'node:crypto'
import { agorot } from '@/lib/commerce/money'
import { splitInclusiveVat } from '@/lib/commerce/vat'
import { getCheckoutPaymentProvider, loadCheckoutPaymentsEnv } from '@/lib/payments'
import { paymentAttemptIdempotencyKey } from '@/lib/payments/idempotency'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'

export type BeginStripeCheckoutResult =
  | {
      ok: true
      data: {
        order_id: string
        payment_attempt_id: string
        client_secret: string | null
        provider_payment_id: string
        vat_agorot: number
        total_agorot: number
      }
    }
  | { ok: false; error: string; code: string }

/**
 * Minimal Stripe beginCheckout: creates pending order + payment_attempt,
 * then a PaymentIntent via PaymentProvider. VAT is derived server-side from
 * the VAT-inclusive charge total (never trust client tax).
 */
export async function beginStripeCheckout(input: {
  /** VAT-inclusive pre-discount catalog total in agorot. */
  totalAgorot: number
  discountAgorot?: number
  description?: string
}): Promise<BeginStripeCheckoutResult> {
  const env = loadCheckoutPaymentsEnv()
  if (!env.checkoutEnabled) {
    return { ok: false, error: 'התשלום מושבת כרגע', code: 'CHECKOUT_DISABLED' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר לפני התשלום', code: 'UNAUTHENTICATED' }

  const allowed = await checkRateLimit(`begin_stripe_checkout:user:${user.id}`, 10, 60)
  if (!allowed) return { ok: false, error: 'יותר מדי ניסיונות', code: 'RATE_LIMITED' }

  if (!Number.isSafeInteger(input.totalAgorot) || input.totalAgorot <= 0) {
    return { ok: false, error: 'סכום לא תקין', code: 'VALIDATION' }
  }

  const discount = input.discountAgorot ?? 0
  if (!Number.isSafeInteger(discount) || discount < 0 || discount >= input.totalAgorot) {
    return { ok: false, error: 'הנחה לא תקינה', code: 'VALIDATION' }
  }

  const chargeAgorot = input.totalAgorot - discount
  const vatSplit = splitInclusiveVat(chargeAgorot)
  const admin = createAdminClient()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 60_000)
  const orderNumber = `KE-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}-${randomUUID().slice(0, 8).toUpperCase()}`

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      user_id: user.id,
      status: 'pending',
      subtotal_ils: input.totalAgorot / 100,
      discount_ils: discount / 100,
      cashback_applied_ils: 0,
      total_ils: chargeAgorot / 100,
      currency: 'ILS',
      subtotal_agorot: input.totalAgorot,
      discount_agorot: discount,
      vat_agorot: vatSplit.vatAgorot,
      total_agorot: chargeAgorot,
      vat_rate_bps: vatSplit.vatRateBps,
      order_number: orderNumber,
      expires_at: expiresAt.toISOString(),
      accepted_terms_at: now.toISOString(),
    })
    .select('id')
    .single()

  if (orderError || !order) {
    return { ok: false, error: orderError?.message ?? 'order create failed', code: 'INTERNAL' }
  }

  const attemptId = randomUUID()
  const idempotencyKey = paymentAttemptIdempotencyKey(attemptId)

  const { data: attempt, error: attemptError } = await admin
    .from('payment_attempts')
    .insert({
      id: attemptId,
      order_id: order.id,
      provider:
        env.provider === 'payoneer' ? 'payoneer' : env.provider === 'mock' ? 'mock' : 'stripe',
      idempotency_key: idempotencyKey,
      amount_agorot: chargeAgorot,
      currency: 'ILS',
      status: 'initiated',
    })
    .select('id')
    .single()

  if (attemptError || !attempt) {
    await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    return { ok: false, error: attemptError?.message ?? 'attempt failed', code: 'INTERNAL' }
  }

  try {
    const provider = getCheckoutPaymentProvider()
    const appUrl = env.stripe?.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const created = await provider.createPayment({
      orderId: order.id,
      paymentAttemptId: attempt.id,
      amountAgorot: agorot(chargeAgorot),
      currency: 'ILS',
      idempotencyKey,
      description: input.description ?? `הזמנה ${orderNumber}`,
      customerEmail: user.email ?? undefined,
      metadata: { order_number: orderNumber },
      successUrl: `${appUrl}/checkout/return?order_id=${order.id}`,
      cancelUrl: `${appUrl}/checkout/failed?order_id=${order.id}`,
    })

    await admin
      .from('payment_attempts')
      .update({
        provider_payment_id: created.providerPaymentId,
        client_secret: created.clientSecret,
        status: created.status === 'succeeded' ? 'succeeded' : 'requires_action',
        raw: created.raw,
      })
      .eq('id', attempt.id)

    await admin
      .from('orders')
      .update({ stripe_payment_intent_id: created.providerPaymentId })
      .eq('id', order.id)

    await admin.from('order_status_audit').insert({
      order_id: order.id,
      from_status: 'cart',
      to_status: 'pending',
      event: 'BEGIN_CHECKOUT',
      actor: `user:${user.id}`,
      payload: {
        payment_attempt_id: attempt.id,
        provider: provider.kind,
        vat_agorot: vatSplit.vatAgorot,
      },
    })

    return {
      ok: true,
      data: {
        order_id: order.id,
        payment_attempt_id: attempt.id,
        client_secret: created.clientSecret,
        provider_payment_id: created.providerPaymentId,
        vat_agorot: vatSplit.vatAgorot,
        total_agorot: chargeAgorot,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'provider error'
    await admin
      .from('payment_attempts')
      .update({ status: 'failed', failure_message: message })
      .eq('id', attempt.id)
    return { ok: false, error: 'שגיאה בחיבור לספק הסליקה', code: 'PAYMENT_PROVIDER_ERROR' }
  }
}
