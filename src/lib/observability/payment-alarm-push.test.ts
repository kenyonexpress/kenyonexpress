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

/**
 * A FRESH mock per test, never one shared object reset in `beforeEach`.
 *
 * Measured, on 2026-08-19: this file passed alone six times out of six and
 * failed twice inside the full 180-file suite, then passed in the full suite on
 * the next run -- a load-dependent flake. The shape of the failure named the
 * cause: the second test read `calls[0]` and found the FIRST test's payload
 * (`pay-1`, "payment verified but finalize failed"). Each test re-imports
 * `@sentry/nextjs` from scratch through `resetModules`, and under a saturated
 * machine that import can outrun vitest's 5s default; the test is failed, its
 * promise keeps running, and its fetch lands during the next test, where a
 * shared mock happily reports it as that test's call.
 *
 * With one mock per test a late call from a dead test lands in an object nobody
 * reads, so one slow import fails one test instead of two -- and the surviving
 * failure says what actually went wrong rather than pointing at a body from a
 * test that already finished.
 */
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

/**
 * The timeout is this file's own, and it is about the import rather than the
 * assertion. `resetModules` + a dynamic import of `./sentry` re-evaluates the
 * whole `@sentry/nextjs` graph on every single test, which is the price of
 * reading `DSN` at module load; on a machine running sixteen test workers that
 * is occasionally seconds. Nothing here waits on a network: `fetch` is stubbed
 * and resolves immediately, so a slow run means a slow import and not a hung
 * alert, and the honest fix is to let the import finish.
 */
const IMPORT_HEAVY_TIMEOUT_MS = 20_000

async function load() {
  return await import('./sentry')
}

describe('capturePaymentAlarm push channel', () => {
  it(
    'pushes even when no Sentry DSN is configured',
    async () => {
      vi.stubEnv('SENTRY_DSN', '')
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')

      const { capturePaymentAlarm } = await load()
      await capturePaymentAlarm('payment verified but finalize failed', {
        stage: 'cardcom_webhook_finalize',
        orderId: 'ord-1',
        paymentId: 'pay-1',
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
    IMPORT_HEAVY_TIMEOUT_MS,
  )

  it(
    'carries the stage and the identifiers, and no amount',
    async () => {
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
    },
    IMPORT_HEAVY_TIMEOUT_MS,
  )

  it(
    'resolves rather than throwing when the push itself fails',
    async () => {
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
    },
    IMPORT_HEAVY_TIMEOUT_MS,
  )

  it(
    'honours the ALERTS_ENABLED=false kill switch',
    async () => {
      vi.stubEnv('SENTRY_DSN', '')
      vi.stubEnv('ALERTS_ENABLED', 'false')

      const { capturePaymentAlarm } = await load()
      await capturePaymentAlarm('payment row carries no readable amount', {
        stage: 'cardcom_webhook_amount',
        orderId: 'ord-1',
      })

      expect(fetchMock).not.toHaveBeenCalled()
    },
    IMPORT_HEAVY_TIMEOUT_MS,
  )
})
