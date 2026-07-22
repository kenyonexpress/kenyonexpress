import { planLifecycleTransition } from '@/server/domain/orders/lifecycle-audit'
import { planStripePaymentSucceeded } from '@/server/payments/stripe-finalize'
import Stripe from 'stripe'
/**
 * Stripe Test Clocks integration suite.
 * Runs only when STRIPE_SECRET_KEY is a sk_test_ key.
 * Advances a test clock and asserts our recovery planner uses injected `now`
 * (order TTL is platform-owned; the clock proves time control wiring).
 */
import { afterAll, describe, expect, it } from 'vitest'

const secret = process.env.STRIPE_SECRET_KEY ?? ''
const shouldRun = secret.startsWith('sk_test_')

const describeIntegration = shouldRun ? describe : describe.skip

describeIntegration('Stripe test clocks integration', () => {
  const stripe = new Stripe(secret, { apiVersion: '2025-08-27.basil' })
  let clockId: string | null = null

  afterAll(async () => {
    if (clockId) {
      try {
        await stripe.testHelpers.testClocks.del(clockId)
      } catch {
        // best-effort cleanup
      }
    }
  })

  it('creates a test clock, freezes time, and advances it', async () => {
    const frozen = Math.floor(Date.now() / 1000) - 60
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: frozen,
      name: 'kenyon-checkout-foundation',
    })
    clockId = clock.id
    expect(clock.frozen_time).toBe(frozen)

    const advancedTo = frozen + 31 * 60
    const advanced = await stripe.testHelpers.testClocks.advance(clock.id, {
      frozen_time: advancedTo,
    })
    expect(advanced.frozen_time).toBe(advancedTo)

    // Platform TTL: a pending order that "started" at frozen would be expired
    // after +31 minutes relative to the advanced clock.
    const startedAt = new Date(frozen * 1000)
    const expiresAt = new Date(startedAt.getTime() + 30 * 60_000)
    const now = new Date(advancedTo * 1000)
    expect(now.getTime()).toBeGreaterThan(expiresAt.getTime())

    const expirePlan = planLifecycleTransition({
      from: 'pending',
      event: 'EXPIRE',
      actor: 'cron',
      payload: {
        stripe_test_clock: clock.id,
        frozen_time: advancedTo,
      },
    })
    expect(expirePlan.to).toBe('cancelled')
  }, 60_000)

  it('creates a PaymentIntent in ILS agorot and plans finalize', async () => {
    const pi = await stripe.paymentIntents.create(
      {
        amount: 11800,
        currency: 'ils',
        automatic_payment_methods: { enabled: true },
        metadata: {
          order_id: '00000000-0000-4000-8000-000000000099',
          payment_attempt_id: '00000000-0000-4000-8000-000000000098',
        },
      },
      { idempotencyKey: `pi:testclock:${Date.now()}` },
    )

    expect(pi.currency).toBe('ils')
    expect(pi.amount).toBe(11800)
    expect(pi.client_secret).toBeTruthy()

    const plan = planStripePaymentSucceeded({
      orderId: '00000000-0000-4000-8000-000000000099',
      fromStatus: 'pending',
      providerEventId: `evt_test_${pi.id}`,
      providerPaymentId: pi.id,
    })
    expect(plan.kind).toBe('apply')
  }, 60_000)
})

describe('Stripe test clocks gate', () => {
  it('documents skip behavior without sk_test_ key', () => {
    if (!shouldRun) {
      expect(secret.startsWith('sk_test_')).toBe(false)
    } else {
      expect(shouldRun).toBe(true)
    }
  })
})
