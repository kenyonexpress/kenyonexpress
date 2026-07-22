import { LifecycleTransitionError } from '@/server/domain/orders/lifecycle'
import { planStripePaymentSucceeded } from '@/server/payments/stripe-finalize'
import { describe, expect, it } from 'vitest'

describe('planStripePaymentSucceeded', () => {
  it('plans pending -> paid with audit', () => {
    const plan = planStripePaymentSucceeded({
      orderId: 'ord_1',
      fromStatus: 'pending',
      providerEventId: 'evt_1',
      providerPaymentId: 'pi_1',
    })
    expect(plan.kind).toBe('apply')
    if (plan.kind !== 'apply') return
    expect(plan.plan.to).toBe('paid')
    expect(plan.plan.audit.provider_event_id).toBe('evt_1')
  })

  it('treats paid/fulfilled/refunded as replay', () => {
    for (const status of ['paid', 'fulfilled', 'refunded'] as const) {
      const plan = planStripePaymentSucceeded({
        orderId: 'ord_1',
        fromStatus: status,
        providerEventId: 'evt_2',
        providerPaymentId: 'pi_1',
      })
      expect(plan).toEqual({ kind: 'replay', orderId: 'ord_1', status })
    }
  })

  it('throws on cancelled orders', () => {
    expect(() =>
      planStripePaymentSucceeded({
        orderId: 'ord_1',
        fromStatus: 'cancelled',
        providerEventId: 'evt_3',
        providerPaymentId: 'pi_1',
      }),
    ).toThrow(LifecycleTransitionError)
  })
})
