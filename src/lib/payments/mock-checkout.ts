import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifiedWebhookEvent,
} from '@/lib/payments/provider'

type StoredIntent = {
  id: string
  clientSecret: string
  amountAgorot: number
  orderId: string
  paymentAttemptId: string
  status: CreatePaymentResult['status']
  idempotencyKey: string
}

const WEBHOOK_SECRET = 'mock_whsec'

/**
 * In-memory provider for unit tests. Supports deterministic webhook signatures.
 */
export class MockCheckoutPaymentProvider implements PaymentProvider {
  readonly kind = 'mock' as const
  private intents = new Map<string, StoredIntent>()
  private byIdempotency = new Map<string, string>()
  private seq = 0

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const existingId = this.byIdempotency.get(input.idempotencyKey)
    if (existingId) {
      const existing = this.intents.get(existingId)
      if (!existing) throw new Error('Mock intent missing for idempotency key')
      return {
        providerPaymentId: existing.id,
        clientSecret: existing.clientSecret,
        redirectUrl: null,
        status: existing.status,
        raw: { ...existing },
      }
    }

    this.seq += 1
    const id = `pi_mock_${this.seq}`
    const stored: StoredIntent = {
      id,
      clientSecret: `${id}_secret_mock`,
      amountAgorot: input.amountAgorot,
      orderId: input.orderId,
      paymentAttemptId: input.paymentAttemptId,
      status: 'requires_action',
      idempotencyKey: input.idempotencyKey,
    }
    this.intents.set(id, stored)
    this.byIdempotency.set(input.idempotencyKey, id)
    return {
      providerPaymentId: id,
      clientSecret: stored.clientSecret,
      redirectUrl: null,
      status: stored.status,
      raw: { ...stored },
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const intent = this.intents.get(input.providerPaymentId)
    if (!intent) {
      return {
        providerRefundId: `re_missing_${input.providerPaymentId}`,
        status: 'failed',
        raw: { error: 'not_found' },
      }
    }
    intent.status = 'canceled'
    return {
      providerRefundId: `re_mock_${intent.id}`,
      status: 'succeeded',
      raw: { payment_intent: intent.id },
    }
  }

  /** Build a signed mock webhook body for tests. */
  signWebhook(payload: Record<string, unknown>): { body: string; signature: string } {
    const body = JSON.stringify(payload)
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
    return { body, signature }
  }

  async parseAndVerifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhookEvent> {
    const signature = headers.get('stripe-signature') ?? headers.get('x-mock-signature')
    if (!signature) throw new Error('Missing webhook signature')
    const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('Invalid webhook signature')
    }

    const parsed = JSON.parse(rawBody) as {
      id: string
      type: string
      livemode?: boolean
      data: {
        object: {
          id: string
          metadata?: { order_id?: string; payment_attempt_id?: string }
        }
      }
    }

    const intent = this.intents.get(parsed.data.object.id)
    if (intent && parsed.type === 'payment_intent.succeeded') {
      intent.status = 'succeeded'
    }

    return {
      providerEventId: parsed.id,
      type: parsed.type,
      providerPaymentId: parsed.data.object.id,
      orderId: parsed.data.object.metadata?.order_id ?? intent?.orderId ?? null,
      paymentAttemptId:
        parsed.data.object.metadata?.payment_attempt_id ?? intent?.paymentAttemptId ?? null,
      livemode: parsed.livemode ?? false,
      raw: parsed as unknown as Record<string, unknown>,
    }
  }
}

let shared: MockCheckoutPaymentProvider | null = null

export function getSharedMockCheckoutProvider(): MockCheckoutPaymentProvider {
  if (!shared) shared = new MockCheckoutPaymentProvider()
  return shared
}

export function resetSharedMockCheckoutProvider(): void {
  shared = new MockCheckoutPaymentProvider()
}
