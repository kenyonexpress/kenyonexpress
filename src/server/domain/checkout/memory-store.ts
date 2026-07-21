import { randomUUID } from 'node:crypto'
import type { FinalizableOrderLine, FinalizePlan } from '@/lib/checkout/finalize'
import type { SplitResultView } from '@/lib/checkout/split'

export type MemoryPayment = {
  id: string
  orderId: string
  status: 'initiated' | 'redirected' | 'succeeded' | 'failed' | 'cancelled'
  kind: 'charge' | 'token_charge'
  amountIls: number
  walletAppliedIls: number
  idempotencyKey: string
  lowProfileId: string | null
  transactionId: string | null
  saveCard: boolean
  clientRef: string
  raw: Record<string, unknown>
}

export type MemoryOrder = {
  id: string
  orderNumber: string
  userId: string
  status: 'pending' | 'paid' | 'cancelled' | 'refunded'
  addressId: string | null
  acceptedTermsAt: string
  expiresAt: string
  paidAt: string | null
  split: SplitResultView
  lines: FinalizableOrderLine[]
  createdAt: string
}

export type MemoryCoupon = {
  code: string
  orderItemId: string
  productId: string
  supplierId: string
  userId: string
  qrPayload: string
  expiresAt: string
  status: 'issued' | 'used' | 'expired' | 'refunded'
}

export type MemoryWebhookEvent = {
  id: string
  provider: 'cardcom'
  externalEventId: string
  signatureValid: boolean
  verifiedAgainstApi: boolean
  payload: Record<string, unknown>
  createdAt: string
}

export type MemoryWalletTx = {
  idempotencyKey: string
  userId: string
  amountIls: number
  reason: 'cashback_earn' | 'order_spend'
  orderId: string
}

type MemoryDb = {
  orders: Map<string, MemoryOrder>
  paymentsById: Map<string, MemoryPayment>
  paymentsByClientRef: Map<string, MemoryPayment>
  paymentsByLowProfile: Map<string, MemoryPayment>
  coupons: MemoryCoupon[]
  webhookEvents: Map<string, MemoryWebhookEvent>
  walletTx: Map<string, MemoryWalletTx>
  tokens: Array<{
    userId: string
    token: string
    last4: string
    brand: string
    expiryMonth: number
    expiryYear: number
  }>
}

function createDb(): MemoryDb {
  return {
    orders: new Map(),
    paymentsById: new Map(),
    paymentsByClientRef: new Map(),
    paymentsByLowProfile: new Map(),
    coupons: [],
    webhookEvents: new Map(),
    walletTx: new Map(),
    tokens: [],
  }
}

const globalStore = globalThis as typeof globalThis & {
  __keCheckoutMemory?: MemoryDb
}

function db(): MemoryDb {
  if (!globalStore.__keCheckoutMemory) {
    globalStore.__keCheckoutMemory = createDb()
  }
  return globalStore.__keCheckoutMemory
}

export function resetCheckoutMemoryStore(): void {
  globalStore.__keCheckoutMemory = createDb()
}

export function memoryCreateOrder(input: {
  userId: string
  addressId: string | null
  split: SplitResultView
  lines: Omit<FinalizableOrderLine, 'orderItemId'>[]
  clientRef: string
  saveCard: boolean
  acceptTerms: true
}): { order: MemoryOrder; payment: MemoryPayment } {
  const existing = db().paymentsByClientRef.get(`lp:${input.clientRef}`)
  if (existing) {
    const order = db().orders.get(existing.orderId)
    if (!order) throw new Error('orphan payment in memory store')
    return { order, payment: existing }
  }

  const orderId = randomUUID()
  const paymentId = randomUUID()
  const now = new Date()
  const lines: FinalizableOrderLine[] = input.lines.map((line) => ({
    ...line,
    orderItemId: randomUUID(),
  }))

  const order: MemoryOrder = {
    id: orderId,
    orderNumber: `KE-MEM-${orderId.slice(0, 8).toUpperCase()}`,
    userId: input.userId,
    status: 'pending',
    addressId: input.addressId,
    acceptedTermsAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    paidAt: null,
    split: input.split,
    lines,
    createdAt: now.toISOString(),
  }

  const payment: MemoryPayment = {
    id: paymentId,
    orderId,
    status: 'initiated',
    kind: 'charge',
    amountIls: input.split.cardChargeIls,
    walletAppliedIls: input.split.walletAppliedIls,
    idempotencyKey: `lp:${input.clientRef}`,
    lowProfileId: null,
    transactionId: null,
    saveCard: input.saveCard,
    clientRef: input.clientRef,
    raw: {},
  }

  db().orders.set(orderId, order)
  db().paymentsById.set(paymentId, payment)
  db().paymentsByClientRef.set(payment.idempotencyKey, payment)
  return { order, payment }
}

export function memoryAttachLowProfile(
  paymentId: string,
  lowProfileId: string,
  raw: Record<string, unknown>,
): MemoryPayment {
  const payment = db().paymentsById.get(paymentId)
  if (!payment) throw new Error('payment not found')
  payment.lowProfileId = lowProfileId
  payment.status = 'redirected'
  payment.raw = raw
  db().paymentsByLowProfile.set(lowProfileId, payment)
  return payment
}

export function memoryGetPaymentByLowProfile(lowProfileId: string): MemoryPayment | null {
  return db().paymentsByLowProfile.get(lowProfileId) ?? null
}

export function memoryGetOrder(orderId: string): MemoryOrder | null {
  return db().orders.get(orderId) ?? null
}

export function memoryGetPayment(paymentId: string): MemoryPayment | null {
  return db().paymentsById.get(paymentId) ?? null
}

export function memoryRecordWebhook(event: {
  externalEventId: string
  signatureValid: boolean
  verifiedAgainstApi: boolean
  payload: Record<string, unknown>
}): { inserted: boolean; event: MemoryWebhookEvent } {
  const key = `cardcom:${event.externalEventId}`
  const existing = db().webhookEvents.get(key)
  if (existing) return { inserted: false, event: existing }
  const row: MemoryWebhookEvent = {
    id: randomUUID(),
    provider: 'cardcom',
    externalEventId: event.externalEventId,
    signatureValid: event.signatureValid,
    verifiedAgainstApi: event.verifiedAgainstApi,
    payload: event.payload,
    createdAt: new Date().toISOString(),
  }
  db().webhookEvents.set(key, row)
  return { inserted: true, event: row }
}

export function memoryApplyFinalize(
  plan: FinalizePlan,
  transactionId: string,
  token?: {
    token: string
    last4: string
    brand: string
    expiryMonth: number
    expiryYear: number
  },
): { order: MemoryOrder; payment: MemoryPayment } {
  const order = db().orders.get(plan.orderId)
  const payment = db().paymentsById.get(plan.paymentId)
  if (!order || !payment) throw new Error('order/payment missing')

  if (order.status === 'paid' && payment.status === 'succeeded') {
    return { order, payment }
  }

  payment.status = 'succeeded'
  payment.transactionId = transactionId
  order.status = 'paid'
  order.paidAt = new Date().toISOString()

  for (const coupon of plan.coupons) {
    db().coupons.push({
      code: coupon.code,
      orderItemId: coupon.orderItemId,
      productId: coupon.productId,
      supplierId: coupon.supplierId,
      userId: plan.userId,
      qrPayload: coupon.qrPayload,
      expiresAt: coupon.expiresAt,
      status: 'issued',
    })
  }

  if (plan.walletAppliedIls > 0) {
    const key = `order:${plan.orderId}:spend`
    if (!db().walletTx.has(key)) {
      db().walletTx.set(key, {
        idempotencyKey: key,
        userId: plan.userId,
        amountIls: plan.walletAppliedIls,
        reason: 'order_spend',
        orderId: plan.orderId,
      })
    }
  }

  if (plan.cashbackEarnIls > 0) {
    const key = `order:${plan.orderId}:cashback`
    if (!db().walletTx.has(key)) {
      db().walletTx.set(key, {
        idempotencyKey: key,
        userId: plan.userId,
        amountIls: plan.cashbackEarnIls,
        reason: 'cashback_earn',
        orderId: plan.orderId,
      })
    }
  }

  if (plan.saveCard && token) {
    db().tokens.push({
      userId: plan.userId,
      token: token.token,
      last4: token.last4,
      brand: token.brand,
      expiryMonth: token.expiryMonth,
      expiryYear: token.expiryYear,
    })
  }

  return { order, payment }
}

export function memoryListCouponsForUser(userId: string): MemoryCoupon[] {
  return db().coupons.filter((c) => c.userId === userId)
}

export function memoryListWalletTx(orderId: string): MemoryWalletTx[] {
  return [...db().walletTx.values()].filter((t) => t.orderId === orderId)
}

export function memoryMarkPaymentFailed(paymentId: string, code: string): void {
  const payment = db().paymentsById.get(paymentId)
  if (!payment) return
  payment.status = 'failed'
  payment.raw = { ...payment.raw, failureCode: code }
}
