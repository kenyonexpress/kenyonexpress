import { agorot } from '@/lib/commerce/money'
import {
  ProviderNotImplementedError,
  getCheckoutPaymentProvider,
  getSharedMockCheckoutProvider,
  resetSharedMockCheckoutProvider,
} from '@/lib/payments'
import { PayoneerPaymentProvider } from '@/lib/payments/payoneer/provider'
import { beforeEach, describe, expect, it } from 'vitest'

describe('PaymentProvider factory', () => {
  beforeEach(() => {
    resetSharedMockCheckoutProvider()
  })

  it('returns mock provider in test env', () => {
    const provider = getCheckoutPaymentProvider({ NODE_ENV: 'test' })
    expect(provider.kind).toBe('mock')
  })

  it('returns payoneer stub when selected', () => {
    const provider = getCheckoutPaymentProvider({
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: 'payoneer',
      CHECKOUT_ENABLED: 'true',
    })
    expect(provider.kind).toBe('payoneer')
  })
})

describe('MockCheckoutPaymentProvider', () => {
  beforeEach(() => {
    resetSharedMockCheckoutProvider()
  })

  it('creates a PaymentIntent-shaped result and is idempotent', async () => {
    const provider = getSharedMockCheckoutProvider()
    const input = {
      orderId: 'ord_1',
      paymentAttemptId: 'att_1',
      amountAgorot: agorot(9900),
      currency: 'ILS' as const,
      idempotencyKey: 'pi:att_1',
      description: 'test',
      successUrl: 'http://localhost/ok',
      cancelUrl: 'http://localhost/fail',
    }

    const first = await provider.createPayment(input)
    const second = await provider.createPayment(input)
    expect(first.providerPaymentId).toBe(second.providerPaymentId)
    expect(first.clientSecret).toBeTruthy()
    expect(first.status).toBe('requires_action')
  })

  it('verifies signed webhooks and rejects bad signatures', async () => {
    const provider = getSharedMockCheckoutProvider()
    const created = await provider.createPayment({
      orderId: 'ord_2',
      paymentAttemptId: 'att_2',
      amountAgorot: agorot(100),
      currency: 'ILS',
      idempotencyKey: 'pi:att_2',
      description: 't',
      successUrl: 'http://localhost/ok',
      cancelUrl: 'http://localhost/fail',
    })

    const { body, signature } = provider.signWebhook({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: {
        object: {
          id: created.providerPaymentId,
          metadata: { order_id: 'ord_2', payment_attempt_id: 'att_2' },
        },
      },
    })

    const event = await provider.parseAndVerifyWebhook(
      body,
      new Headers({ 'stripe-signature': signature }),
    )
    expect(event.providerEventId).toBe('evt_1')
    expect(event.orderId).toBe('ord_2')

    await expect(
      provider.parseAndVerifyWebhook(body, new Headers({ 'stripe-signature': 'bad' })),
    ).rejects.toThrow(/Invalid webhook signature/)
  })
})

describe('PayoneerPaymentProvider stub', () => {
  it('throws ProviderNotImplementedError on every method', async () => {
    const provider = new PayoneerPaymentProvider()
    await expect(
      provider.createPayment({
        orderId: 'x',
        paymentAttemptId: 'y',
        amountAgorot: agorot(1),
        currency: 'ILS',
        idempotencyKey: 'pi:y',
        description: 'x',
        successUrl: 'http://localhost/ok',
        cancelUrl: 'http://localhost/fail',
      }),
    ).rejects.toBeInstanceOf(ProviderNotImplementedError)
  })
})
