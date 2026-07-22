import type { StripeEnv } from '@/lib/payments/checkout-env'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatus,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifiedWebhookEvent,
} from '@/lib/payments/provider'
import { getStripeClient } from '@/lib/payments/stripe/client'
import type Stripe from 'stripe'

function mapPiStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
  switch (status) {
    case 'succeeded':
      return 'succeeded'
    case 'processing':
      return 'processing'
    case 'canceled':
      return 'canceled'
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'requires_capture':
      return 'requires_action'
    default:
      return 'failed'
  }
}

export class StripePaymentProvider implements PaymentProvider {
  readonly kind = 'stripe' as const

  constructor(private readonly env: StripeEnv) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const stripe = getStripeClient(this.env)
    const pi = await stripe.paymentIntents.create(
      {
        amount: input.amountAgorot,
        currency: 'ils',
        automatic_payment_methods: { enabled: true },
        description: input.description,
        receipt_email: input.customerEmail,
        metadata: {
          order_id: input.orderId,
          payment_attempt_id: input.paymentAttemptId,
          ...(input.metadata ?? {}),
        },
      },
      { idempotencyKey: input.idempotencyKey },
    )

    return {
      providerPaymentId: pi.id,
      clientSecret: pi.client_secret,
      redirectUrl: null,
      status: mapPiStatus(pi.status),
      raw: pi as unknown as Record<string, unknown>,
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const stripe = getStripeClient(this.env)
    const refund = await stripe.refunds.create(
      {
        payment_intent: input.providerPaymentId,
        amount: input.amountAgorot,
        reason: input.reason === 'fraudulent' ? 'fraudulent' : 'requested_by_customer',
      },
      { idempotencyKey: input.idempotencyKey },
    )

    return {
      providerRefundId: refund.id,
      status:
        refund.status === 'succeeded'
          ? 'succeeded'
          : refund.status === 'pending'
            ? 'pending'
            : 'failed',
      raw: refund as unknown as Record<string, unknown>,
    }
  }

  async parseAndVerifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhookEvent> {
    const stripe = getStripeClient(this.env)
    const signature = headers.get('stripe-signature')
    if (!signature) {
      throw new Error('Missing stripe-signature header')
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature, this.env.webhookSecret)
    const obj = event.data.object as {
      id?: string
      metadata?: Record<string, string>
      payment_intent?: string | { id?: string }
    }

    let providerPaymentId: string | null = null
    if (event.type.startsWith('payment_intent.')) {
      providerPaymentId = typeof obj.id === 'string' ? obj.id : null
    } else if (typeof obj.payment_intent === 'string') {
      providerPaymentId = obj.payment_intent
    } else if (obj.payment_intent && typeof obj.payment_intent === 'object') {
      providerPaymentId = obj.payment_intent.id ?? null
    }

    return {
      providerEventId: event.id,
      type: event.type,
      providerPaymentId,
      orderId: obj.metadata?.order_id ?? null,
      paymentAttemptId: obj.metadata?.payment_attempt_id ?? null,
      livemode: event.livemode,
      raw: event as unknown as Record<string, unknown>,
    }
  }
}
