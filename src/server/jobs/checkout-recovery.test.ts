import { agorot } from '@/lib/commerce/money'
import { getSharedMockCheckoutProvider, resetSharedMockCheckoutProvider } from '@/lib/payments'
import { paymentAttemptIdempotencyKey } from '@/lib/payments/idempotency'
import { planLifecycleTransition } from '@/server/domain/orders/lifecycle-audit'
import { planStripePaymentSucceeded } from '@/server/payments/stripe-finalize'
import { beforeEach, describe, expect, it } from 'vitest'

describe('failure paths: double-click + webhook replay', () => {
  beforeEach(() => {
    resetSharedMockCheckoutProvider()
  })

  it('double-click returns the same PaymentIntent via idempotency key', async () => {
    const provider = getSharedMockCheckoutProvider()
    const attemptId = 'att_double'
    const key = paymentAttemptIdempotencyKey(attemptId)
    const input = {
      orderId: 'ord_d',
      paymentAttemptId: attemptId,
      amountAgorot: agorot(5000),
      currency: 'ILS' as const,
      idempotencyKey: key,
      description: 'dbl',
      successUrl: 'http://localhost/ok',
      cancelUrl: 'http://localhost/fail',
    }
    const a = await provider.createPayment(input)
    const b = await provider.createPayment(input)
    expect(a.providerPaymentId).toBe(b.providerPaymentId)
    expect(key).toBe('pi:att_double')
  })

  it('webhook replay is a no-op at the finalize planner', () => {
    const first = planStripePaymentSucceeded({
      orderId: 'ord_r',
      fromStatus: 'pending',
      providerEventId: 'evt_r1',
      providerPaymentId: 'pi_r',
    })
    expect(first.kind).toBe('apply')

    const second = planStripePaymentSucceeded({
      orderId: 'ord_r',
      fromStatus: 'paid',
      providerEventId: 'evt_r1',
      providerPaymentId: 'pi_r',
    })
    expect(second).toEqual({ kind: 'replay', orderId: 'ord_r', status: 'paid' })
  })

  it('expiry plans pending -> cancelled for abandoned recovery', () => {
    const plan = planLifecycleTransition({
      from: 'pending',
      event: 'EXPIRE',
      actor: 'cron',
    })
    expect(plan.to).toBe('cancelled')
  })
})
