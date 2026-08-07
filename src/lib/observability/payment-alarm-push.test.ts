import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Goal 10. `capturePaymentAlarm` opened with `if (!DSN) return`, and GO-LIVE.md
 * lists SENTRY_DSN as still unset. Every money-path alarm in the Cardcom
 * webhook was therefore a no-op in production -- including the one for "the
 * card was charged and verified, and the order did not close", which is the
 * worst state the system can reach. `alertMoneyFailure` existed for precisely
 * this case and had zero callers, so neither channel carried anything.
 *
 * These tests pin the property that keeps it that way: the phone push does not
 * depend on Sentry being configured.
 *
 * Verified to fail without the change: restoring the early `if (!DSN) return`
 * turns the no-DSN cases into zero fetches.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

async function load() {
  return await import('./sentry')
}

describe('capturePaymentAlarm push channel', () => {
  it('pushes even when no Sentry DSN is configured', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')

    const { capturePaymentAlarm } = await load()
    await capturePaymentAlarm('payment verified but finalize failed', {
      stage: 'cardcom_webhook_finalize',
      orderId: 'ord-1',
      paymentId: 'pay-1',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('carries the stage and the identifiers, and no amount', async () => {
    vi.stubEnv('SENTRY_DSN', '')

    const { capturePaymentAlarm } = await load()
    await capturePaymentAlarm('cardcom charged an amount we did not ask for', {
      stage: 'cardcom_webhook_amount',
      orderId: 'ord-42',
      paymentId: 'pay-42',
      detail: { charged_agorot: 999_00, expected_agorot: 1_00 },
    })

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    const init = call?.[1]
    const body = String(init.body)
    expect(body).toContain('cardcom_webhook_amount')
    expect(body).toContain('ord-42')
    expect(body).toContain('pay-42')
    // The topic is public unless NTFY_TOPIC is overridden, so the alert is a
    // handle for looking the incident up, never the money itself.
    expect(body).not.toContain('99900')
    expect(init.headers.Priority).toBe('urgent')
  })

  it('resolves rather than throwing when the push itself fails', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    fetchMock.mockRejectedValue(new Error('ntfy unreachable'))

    const { capturePaymentAlarm } = await load()

    // A throw here would surface as the error the customer sees, on a branch
    // that is already handling a failure.
    await expect(
      capturePaymentAlarm('payment verified but finalize failed', {
        stage: 'cardcom_webhook_finalize',
        orderId: 'ord-1',
      }),
    ).resolves.toBeUndefined()
  })

  it('honours the ALERTS_ENABLED=false kill switch', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('ALERTS_ENABLED', 'false')

    const { capturePaymentAlarm } = await load()
    await capturePaymentAlarm('payment row carries no readable amount', {
      stage: 'cardcom_webhook_amount',
      orderId: 'ord-1',
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
