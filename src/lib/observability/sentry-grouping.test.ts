import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Grouping, which is the difference between an alert that names a broken half
 * of the money path and one that says "payments".
 *
 * Sentry groups an exception by its stack trace, and the money path funnels
 * through shared helpers, so the same throw reached from two stages arrived as
 * ONE issue. Resolving it silenced both.
 */

const scope = {
  setTag: vi.fn(),
  setContext: vi.fn(),
  setLevel: vi.fn(),
  setFingerprint: vi.fn(),
}
const captureException = vi.fn()
const captureMessage = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  withScope: (run: (s: typeof scope) => void) => run(scope),
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}))

const alertMoneyFailure = vi.fn()
vi.mock('@/lib/observability/alert', () => ({
  alertMoneyFailure: (...args: unknown[]) => alertMoneyFailure(...args),
}))

// The module reads the DSN once at import, and every capture is inert without
// one. Set before the dynamic import, not after.
process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1'

const { capturePaymentAlarm, capturePaymentError } = await import('@/lib/observability/sentry')

beforeEach(() => {
  scope.setTag.mockReset()
  scope.setContext.mockReset()
  scope.setLevel.mockReset()
  scope.setFingerprint.mockReset()
  captureException.mockReset()
  captureMessage.mockReset()
  alertMoneyFailure.mockReset()
})

describe('capturePaymentError grouping', () => {
  it('splits two stages that throw from the same place', () => {
    capturePaymentError(new Error('boom'), { stage: 'cardcom_webhook_finalize' })
    const first = scope.setFingerprint.mock.calls[0]?.[0]
    scope.setFingerprint.mockReset()
    capturePaymentError(new Error('boom'), { stage: 'checkout_begin' })
    const second = scope.setFingerprint.mock.calls[0]?.[0]

    expect(first).not.toEqual(second)
    expect(first).toContain('cardcom_webhook_finalize')
    expect(second).toContain('checkout_begin')
  })

  it('keeps Sentry own grouping inside a stage, so it only ever splits', () => {
    capturePaymentError(new Error('boom'), { stage: 'cardcom_webhook_finalize' })
    // Without `{{ default }}` every exception at a stage would collapse into
    // one issue, which is the opposite mistake and a worse one.
    expect(scope.setFingerprint).toHaveBeenCalledWith([
      '{{ default }}',
      'payments',
      'cardcom_webhook_finalize',
    ])
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('still tags the stage, because a fingerprint is not searchable', () => {
    capturePaymentError(new Error('boom'), { stage: 'checkout_begin', orderId: 'order-1' })
    expect(scope.setTag).toHaveBeenCalledWith('area', 'payments')
    expect(scope.setTag).toHaveBeenCalledWith('stage', 'checkout_begin')
  })
})

describe('capturePaymentAlarm grouping', () => {
  it('pins the issue to the stage and the message together', async () => {
    await capturePaymentAlarm('cardcom charged an amount we did not ask for', {
      stage: 'cardcom_webhook_amount',
    })
    expect(scope.setFingerprint).toHaveBeenCalledWith([
      'payments',
      'cardcom_webhook_amount',
      'cardcom charged an amount we did not ask for',
    ])
  })

  it('keeps two messages from one stage apart', async () => {
    await capturePaymentAlarm('payment row carries no readable amount', {
      stage: 'cardcom_webhook_amount',
    })
    const first = scope.setFingerprint.mock.calls[0]?.[0]
    scope.setFingerprint.mockReset()
    await capturePaymentAlarm('cardcom charged an amount we did not ask for', {
      stage: 'cardcom_webhook_amount',
    })
    expect(scope.setFingerprint.mock.calls[0]?.[0]).not.toEqual(first)
  })

  it('pushes to the phone before it touches Sentry at all', async () => {
    await capturePaymentAlarm('payment verified but finalize failed', {
      stage: 'cardcom_webhook_finalize',
    })
    // The push is outside the DSN guard on purpose: its value is working when
    // the rest does not.
    expect(alertMoneyFailure).toHaveBeenCalledTimes(1)
    expect(captureMessage).toHaveBeenCalledTimes(1)
  })
})
