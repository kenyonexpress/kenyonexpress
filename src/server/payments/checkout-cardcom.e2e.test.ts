// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * End-to-end checkout flow against the LOCAL Supabase stack (127.0.0.1:54321,
 * the same one `pnpm dev` uses). Covers the full money path in-process:
 *
 *   create order -> payment -> hosted page (mock Cardcom) -> signed webhook ->
 *   verify -> finalize -> escrow hold (coupon) / split execution (physical) ->
 *   release -> payment_events trail, plus webhook replay dedup and the
 *   Upstash retry queue with dead-lettering.
 *
 * The suite self-skips when the local stack is down (CI without Docker), the
 * same convention as the Playwright specs skipping on missing seed.
 */

// ---- env bootstrap (before any @/ import that reads env at call time) -------

function loadDotEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(__dirname, '../../../.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (match?.[1] && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2]
      }
    }
  } catch {
    // no .env.local: the availability probe below will skip the suite
  }
}
loadDotEnvLocal()
process.env.VOUCHER_QR_SECRET ??= 'e2e-voucher-qr-secret-0123456789'
process.env.CRON_SECRET ??= 'e2e-cron-secret'
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000'

import { agorot, ilsToAgorot, percentToBasisPoints, percentageOf } from '@/lib/commerce/money'
import { getSharedMockCardcom } from '@/lib/payments'
import { WEBHOOK_SIGNATURE_HEADER, computeWebhookSignature } from '@/lib/payments/signature'
import { resetInMemoryQueues, retryQueueDepth } from '@/lib/queue/webhook-retry'
import { releaseEscrowForOrderItem } from '@/server/payments/escrow'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
// Matches loadCardcomEnv() under NODE_ENV=test with no CARDCOM_WEBHOOK_SECRET.
const PLATFORM_WEBHOOK_SECRET = process.env.CARDCOM_WEBHOOK_SECRET ?? 'mock-webhook-secret'

async function localStackUp(): Promise<boolean> {
  if (!SUPABASE_URL.includes('127.0.0.1') && !SUPABASE_URL.includes('localhost')) return false
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SERVICE_KEY },
      signal: AbortSignal.timeout(3000),
    })
    return res.status < 500
  } catch {
    return false
  }
}
const available = await localStackUp()

const admin = createClient(SUPABASE_URL || 'http://127.0.0.1:54321', SERVICE_KEY || 'x')
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

type ProductRow = {
  id: string
  type: string
  supplier_id: string
  platform_percent: number | null
  coupon_price_ils: number | null
  price_ils: number
}

// Local interface for the discovery query: the untyped supabase-js builder
// sends tsc into TS2589 on long .not() chains inside a conditional.
type ProductQuery = {
  select(columns: string): ProductQuery
  eq(column: string, value: string): ProductQuery
  not(column: string, operator: string, value: null): ProductQuery
  limit(count: number): ProductQuery
  maybeSingle(): Promise<{ data: ProductRow | null }>
}

async function findProduct(type: 'coupon' | 'physical'): Promise<ProductRow | null> {
  let query = (admin.from('products') as unknown as ProductQuery)
    .select('id, type, supplier_id, platform_percent, coupon_price_ils, price_ils')
    .eq('type', type)
    .not('supplier_id', 'is', null)
    .not('platform_percent', 'is', null)
  if (type === 'coupon') query = query.not('coupon_price_ils', 'is', null)
  const { data } = await query.limit(1).maybeSingle()
  return data ?? null
}

async function getTestUserId(): Promise<string> {
  const { data: profile } = await admin.from('profiles').select('id').limit(1).maybeSingle()
  if (profile) return profile.id as string
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `e2e-checkout-${runId}@test.local`,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`could not create test user: ${error?.message}`)
  return created.user.id
}

/**
 * Inserts the order/item/payment snapshot beginCheckout would produce for a
 * one-line order, then opens a mock hosted page for it. Returns everything the
 * webhook needs.
 */
async function seedOrder(input: {
  userId: string
  product: ProductRow
  productType: 'coupon' | 'physical'
}) {
  const { product, productType } = input
  const faceAgorot = ilsToAgorot(product.price_ils.toFixed(2))
  const paidAgorot =
    productType === 'coupon' ? ilsToAgorot(Number(product.coupon_price_ils).toFixed(2)) : faceAgorot
  const bps = percentToBasisPoints(product.platform_percent ?? 0)
  const commissionAgorot = percentageOf(paidAgorot, bps)

  const now = new Date()
  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      user_id: input.userId,
      status: 'pending',
      subtotal_ils: product.price_ils,
      // The local stack carries integer-money columns without defaults
      // (059-style); remote is still ILS-only. Filling both keeps the seed
      // valid on either schema.
      subtotal_agorot: faceAgorot,
      customer_pays_now_agorot: paidAgorot,
      discount_ils: 0,
      cashback_applied_ils: 0,
      total_ils: paidAgorot / 100,
      currency: 'ILS',
      accepted_terms_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()
  if (orderError || !order) throw new Error(`order insert failed: ${orderError?.message}`)

  const { data: item, error: itemError } = await admin
    .from('order_items')
    .insert({
      order_id: order.id,
      product_id: product.id,
      product_type: productType,
      supplier_id: product.supplier_id,
      quantity: 1,
      unit_price_ils: product.price_ils,
      total_price_ils: product.price_ils,
      supplier_payout_ils: productType === 'physical' ? (faceAgorot - commissionAgorot) / 100 : 0,
      platform_percent: product.platform_percent,
      commission_percent: product.platform_percent,
      cashback_percent: 0,
      item_status: 'pending',
      settlement_status: 'pending',
      upfront_percent: product.platform_percent,
      commission_percent_snapshot: product.platform_percent,
      face_value_agorot: faceAgorot,
      paid_on_site_agorot: paidAgorot,
      unit_price_agorot: faceAgorot,
      customer_pays_now_agorot: paidAgorot,
      platform_fee_agorot: commissionAgorot,
      supplier_due_agorot: productType === 'physical' ? faceAgorot - commissionAgorot : 0,
      commission_agorot: commissionAgorot,
      supplier_immediate_agorot: productType === 'physical' ? faceAgorot - commissionAgorot : 0,
      escrow_held_agorot: 0,
      escrow_release_agorot: 0,
      balance_due_agorot: faceAgorot - paidAgorot,
      cashback_amount_agorot: 0,
    })
    .select('id')
    .single()
  if (itemError || !item) throw new Error(`order_item insert failed: ${itemError?.message}`)

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      order_id: order.id,
      kind: 'charge',
      status: 'initiated',
      amount_ils: paidAgorot / 100,
      currency: 'ILS',
      wallet_applied_ils: 0,
      idempotency_key: `e2e:${runId}:${productType}:${order.id}`,
      cardcom_account_key: 'platform',
    })
    .select('id')
    .single()
  if (paymentError || !payment) throw new Error(`payment insert failed: ${paymentError?.message}`)

  const mock = getSharedMockCardcom()
  const created = await mock.createLowProfile({
    paymentId: payment.id,
    orderId: order.id,
    orderNumber: order.id.slice(0, 8),
    amountAgorot: agorot(paidAgorot),
    saveToken: false,
    successRedirectUrl: 'http://localhost:3000/checkout/return',
    failedRedirectUrl: 'http://localhost:3000/checkout/failed',
    webhookUrl: 'http://localhost:3000/api/payments/cardcom/webhook',
    description: `e2e ${productType}`,
  })
  await admin
    .from('payments')
    .update({ status: 'redirected', cardcom_low_profile_id: created.lowProfileId })
    .eq('id', payment.id)

  return {
    orderId: order.id,
    orderItemId: item.id,
    paymentId: payment.id,
    lowProfileId: created.lowProfileId,
    faceAgorot,
    paidAgorot,
    commissionAgorot,
    bps,
  }
}

async function postWebhook(body: Record<string, unknown>, secret = PLATFORM_WEBHOOK_SECRET) {
  const { POST } = await import('@/app/api/payments/cardcom/webhook/route')
  const raw = JSON.stringify(body)
  const request = new NextRequest('http://localhost:3000/api/payments/cardcom/webhook', {
    method: 'POST',
    body: raw,
    headers: { [WEBHOOK_SIGNATURE_HEADER]: computeWebhookSignature(raw, secret) },
  })
  const response = await POST(request)
  return { status: response.status, json: (await response.json()) as Record<string, unknown> }
}

async function drainRetryQueueOnce() {
  const { POST } = await import('@/app/api/payments/cardcom/retry/route')
  const request = new NextRequest('http://localhost:3000/api/payments/cardcom/retry', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const response = await POST(request)
  return (await response.json()) as Record<string, unknown>
}

async function eventTypes(orderId: string): Promise<string[]> {
  const { data } = await admin
    .from('payment_events')
    .select('event_type')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  return (data ?? []).map((e) => e.event_type as string)
}

describe.runIf(available)('checkout + Cardcom E2E (local stack)', () => {
  let userId: string

  beforeAll(async () => {
    userId = await getTestUserId()
    resetInMemoryQueues()
  })

  it('coupon: escrow hold on payment, release on redemption, fee = product platform_percent', async () => {
    // A dedicated product with a NON-trivial split (10%, not the seed's 100%),
    // so the fee math is actually exercised: 50 ILS held -> 5 ILS fee, 45 ILS
    // release. Every value comes from the product row, nothing is hardcoded in
    // the flow under test.
    const supplierDonor = await findProduct('coupon')
    const anySupplier = supplierDonor ?? (await findProduct('physical'))
    if (!anySupplier) return // empty seed: nothing to attach a product to
    const { data: created, error: productError } = await admin
      .from('products')
      .insert({
        name_he: 'קופון בדיקה E2E',
        slug: `e2e-coupon-${runId}`,
        type: 'coupon',
        supplier_id: anySupplier.supplier_id,
        price_ils: 100,
        coupon_price_ils: 50,
        platform_percent: 10,
        commission_percent: 10,
        coupon_expiry_days: 30,
        is_coupon_enabled: true,
      })
      .select('id, type, supplier_id, platform_percent, coupon_price_ils, price_ils')
      .single()
    expect(productError).toBeNull()
    const product = created as ProductRow

    process.env.ESCROW_FLOW_ENABLED = 'true'
    try {
      const seeded = await seedOrder({ userId, product, productType: 'coupon' })

      const webhookBody = {
        terminalnumber: 1000,
        lowprofilecode: seeded.lowProfileId,
        ResponseCode: 0,
        InternalDealNumber: `e2e-deal-${runId}`,
        Amount: seeded.paidAgorot / 100,
      }
      const first = await postWebhook(webhookBody)
      expect(first.status).toBe(200)
      expect(first.json.ok).toBe(true)
      expect(first.json.queued).toBeUndefined()

      // Payment and order reached their paid states
      const { data: payment } = await admin
        .from('payments')
        .select('status, cardcom_transaction_id')
        .eq('id', seeded.paymentId)
        .single()
      expect(payment?.status).toBe('succeeded')
      const { data: order } = await admin
        .from('orders')
        .select('status, paid_at')
        .eq('id', seeded.orderId)
        .single()
      expect(order?.status).toBe('paid')
      expect(order?.paid_at).toBeTruthy()

      // ESCROW STATE: the line is held, with per-product fee math
      const { data: item } = await admin
        .from('order_items')
        .select('settlement_status')
        .eq('id', seeded.orderItemId)
        .single()
      expect(item?.settlement_status).toBe('escrow_held')

      const expectedFee = percentageOf(agorot(seeded.paidAgorot), seeded.bps)
      const { data: hold } = await admin
        .from('order_escrow_holds')
        .select('held_agorot, platform_fee_agorot, release_agorot, status')
        .eq('order_item_id', seeded.orderItemId)
        .single()
      expect(hold?.status).toBe('held')
      expect(hold?.held_agorot).toBe(seeded.paidAgorot)
      expect(hold?.platform_fee_agorot).toBe(expectedFee)
      expect(hold?.release_agorot).toBe(seeded.paidAgorot - expectedFee)

      // A voucher was issued for the line
      const { data: vouchers } = await admin
        .from('vouchers')
        .select('id, status')
        .eq('order_item_id', seeded.orderItemId)
      expect(vouchers).toHaveLength(1)
      expect(vouchers?.[0]?.status).toBe('issued')

      // Webhook replay is a stored no-op: no double hold, no double voucher
      const replay = await postWebhook(webhookBody)
      expect(replay.json.replay).toBe(true)
      const { data: holdsAfter } = await admin
        .from('order_escrow_holds')
        .select('id')
        .eq('order_item_id', seeded.orderItemId)
      expect(holdsAfter).toHaveLength(1)

      // SETTLEMENT: release on redemption keeps the fee, frees the remainder
      const released = await releaseEscrowForOrderItem(
        admin,
        seeded.orderItemId,
        `e2e:${runId}:release`,
      )
      expect(released).toEqual({ ok: true, replay: false })
      const releasedAgain = await releaseEscrowForOrderItem(
        admin,
        seeded.orderItemId,
        `e2e:${runId}:release`,
      )
      expect(releasedAgain).toEqual({ ok: true, replay: true })

      const { data: holdAfter } = await admin
        .from('order_escrow_holds')
        .select('status, released_at')
        .eq('order_item_id', seeded.orderItemId)
        .single()
      expect(holdAfter?.status).toBe('released')
      const { data: itemAfter } = await admin
        .from('order_items')
        .select('settlement_status')
        .eq('id', seeded.orderItemId)
        .single()
      expect(itemAfter?.settlement_status).toBe('escrow_released')

      // The append-only trail tells the whole story in order
      const trail = await eventTypes(seeded.orderId)
      for (const expected of [
        'webhook_received',
        'payment_verified',
        'payment_succeeded',
        'escrow_held',
        'order_paid',
        'escrow_released',
        'platform_fee_recorded',
      ]) {
        expect(trail, `missing ${expected} in ${trail.join(',')}`).toContain(expected)
      }
    } finally {
      process.env.ESCROW_FLOW_ENABLED = ''
    }
  })

  it('physical: immediate split by the product platform_percent snapshot', async () => {
    const product = await findProduct('physical')
    if (!product) return

    process.env.ESCROW_FLOW_ENABLED = ''
    const seeded = await seedOrder({ userId, product, productType: 'physical' })

    const result = await postWebhook({
      terminalnumber: 1000,
      lowprofilecode: seeded.lowProfileId,
      ResponseCode: 0,
      InternalDealNumber: `e2e-deal-phys-${runId}`,
    })
    expect(result.json.ok).toBe(true)

    const { data: item } = await admin
      .from('order_items')
      .select('settlement_status')
      .eq('id', seeded.orderItemId)
      .single()
    expect(item?.settlement_status).toBe('split_executed')

    // SPLIT: commission is the per-product percent of face, remainder supplier
    const { data: split } = await admin
      .from('split_executions')
      .select('face_value_agorot, commission_agorot, supplier_agorot')
      .eq('order_item_id', seeded.orderItemId)
      .single()
    expect(split?.face_value_agorot).toBe(seeded.faceAgorot)
    expect(split?.commission_agorot).toBe(seeded.commissionAgorot)
    expect(split?.supplier_agorot).toBe(seeded.faceAgorot - seeded.commissionAgorot)

    const trail = await eventTypes(seeded.orderId)
    expect(trail).toContain('split_executed')
    expect(trail).toContain('order_paid')
    expect(trail).not.toContain('escrow_held')
  })

  it('rejects an unsigned webhook and logs it with signature_valid=false', async () => {
    const body = {
      terminalnumber: 1000,
      lowprofilecode: `e2e-unsigned-${runId}`,
      ResponseCode: 0,
    }
    const raw = JSON.stringify(body)
    const { POST } = await import('@/app/api/payments/cardcom/webhook/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/payments/cardcom/webhook', {
        method: 'POST',
        body: raw,
      }),
    )
    const json = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(200) // never educate the attacker
    expect(json.unknown_payment).toBeUndefined() // processing never started

    const { data: event } = await admin
      .from('payment_webhook_events')
      .select('signature_valid, verified_against_api')
      .eq('external_event_id', `e2e-unsigned-${runId}:na`)
      .single()
    expect(event?.signature_valid).toBe(false)
    expect(event?.verified_against_api).toBe(false)
  })

  it('accepts a webhook signed with a supplier account secret (multi-account)', async () => {
    const product = await findProduct('coupon')
    const supplierId = product?.supplier_id ?? null
    const terminal = `9${runId.slice(0, 6)}`
    const secret = `supplier-secret-${runId}`
    const { error } = await admin.from('cardcom_accounts').insert({
      key: `e2e-supplier-${runId}`,
      supplier_id: supplierId,
      terminal_number: terminal,
      api_name: 'e2e-api',
      api_password: 'e2e-password',
      webhook_secret: secret,
    })
    expect(error).toBeNull()

    const body = {
      terminalnumber: Number(terminal),
      lowprofilecode: `e2e-multiacct-${runId}`,
      ResponseCode: 0,
    }
    // Signed with the SUPPLIER secret: reaches payment lookup (unknown_payment)
    const accepted = await postWebhook(body, secret)
    expect(accepted.json.unknown_payment).toBe(true)

    // Same terminal, signed with the wrong secret: rejected before lookup
    const rejected = await postWebhook(
      { ...body, lowprofilecode: `e2e-multiacct-bad-${runId}` },
      PLATFORM_WEBHOOK_SECRET,
    )
    expect(rejected.json.unknown_payment).toBeUndefined()

    await admin.from('cardcom_accounts').delete().eq('key', `e2e-supplier-${runId}`)
  })

  it('parks an unverifiable payment on the retry queue and dead-letters after max attempts', async () => {
    resetInMemoryQueues()
    const product = await findProduct('physical')
    if (!product) return

    const seeded = await seedOrder({ userId, product, productType: 'physical' })
    // Point the payment at a low-profile id the mock has never seen: verify
    // will keep failing, which is exactly the retriable case.
    const ghostLp = `e2e-ghost-${runId}`
    await admin
      .from('payments')
      .update({ cardcom_low_profile_id: ghostLp })
      .eq('id', seeded.paymentId)

    const result = await postWebhook({
      terminalnumber: 1000,
      lowprofilecode: ghostLp,
      ResponseCode: 0,
    })
    expect(result.json.queued).toBe(true)
    expect((await retryQueueDepth()).pending).toBe(1)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const drained = await drainRetryQueueOnce()
      expect(drained.ok).toBe(true)
    }

    const depth = await retryQueueDepth()
    expect(depth.pending).toBe(0)
    expect(depth.dead).toBe(1)

    const trail = await eventTypes(seeded.orderId)
    expect(trail).toContain('webhook_retry_enqueued')
  })
})

describe.runIf(!available)('checkout + Cardcom E2E', () => {
  it.skip('local Supabase stack is not running; suite skipped', () => {})
})
