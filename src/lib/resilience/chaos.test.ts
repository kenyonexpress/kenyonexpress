import { CardcomProvider } from '@/lib/payments/cardcom'
import { isKilled, killSwitchReport, withKillSwitch } from '@/lib/resilience/kill-switches'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

/**
 * Chaos, in the only form a unit test can honestly claim: each dependency is
 * made to fail the way it actually fails, and the assertion is that the caller
 * degrades instead of throwing.
 *
 * These are not a substitute for pulling the plug on a real Redis. What they
 * do cover is the branch that runs when it is pulled, which is the branch that
 * is otherwise never executed until the night it matters.
 */

const account = {
  terminalNumber: '1000',
  apiName: 'test',
  apiPassword: 'pw',
  webhookSecret: 's',
} as unknown as ConstructorParameters<typeof CardcomProvider>[0]

describe('chaos: Cardcom times out', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.CARDCOM_TIMEOUT_MS = '20'
    process.env.CARDCOM_API_BASE_URL = 'https://cardcom.test'
  })
  afterEach(() => {
    process.env.CARDCOM_TIMEOUT_MS = undefined
    process.env.CARDCOM_API_BASE_URL = undefined
  })

  /**
   * THE ONE THAT MATTERS. A charge that times out has not necessarily failed:
   * the request may have arrived and the card may be charged. The legacy
   * interface has no idempotency key, so a second POST is a second charge.
   */
  it('does NOT retry a token charge, because a retry is a second charge', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('AbortError'))
    vi.stubGlobal('fetch', fetchMock)

    const client = new CardcomProvider(account)
    await expect(
      client.chargeWithToken({
        cardcomToken: 'tok',
        amountAgorot: 1000,
        description: 'x',
        paymentId: 'p1',
      } as never),
    ).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry a refund, for the same reason in the other direction', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('AbortError'))
    vi.stubGlobal('fetch', fetchMock)

    const client = new CardcomProvider(account)
    await expect(
      client.refundByTransactionId({ transactionId: 't1', amountAgorot: 1000 } as never),
    ).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('DOES retry the read-only verify, which cannot move money', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('AbortError'))
      .mockResolvedValueOnce({
        text: async () => JSON.stringify({ ResponseCode: 0, LowProfileCode: 'lp1' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const client = new CardcomProvider(account)
    await client.verifyLowProfile('lp1').catch(() => {})

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries the hosted-page create at most once, then gives up', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('AbortError'))
    vi.stubGlobal('fetch', fetchMock)

    const client = new CardcomProvider(account)
    await expect(
      client.createLowProfile({
        amountAgorot: 1000,
        description: 'x',
        paymentId: 'p1',
        successRedirectUrl: 'https://a',
        failedRedirectUrl: 'https://b',
        webhookUrl: 'https://c',
      } as never),
    ).rejects.toThrow()

    // One retry, not a loop: two calls total.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('passes an abort signal, so a hung provider cannot hold the request open', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ text: async () => '{}' })
    vi.stubGlobal('fetch', fetchMock)

    const client = new CardcomProvider(account)
    await client.verifyLowProfile('lp1').catch(() => {})

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('chaos: a subsystem is switched off', () => {
  it('is off only for a value that plainly says so', () => {
    for (const raw of ['1', 'true', 'TRUE', ' on ', 'yes']) {
      expect(isKilled('cache', { KILL_SWITCH_CACHE: raw } as unknown as NodeJS.ProcessEnv)).toBe(
        true,
      )
    }
    // An accidental switch takes a working subsystem out of the shop, so
    // anything ambiguous means ON.
    for (const raw of [undefined, '', '0', 'false', 'off', 'maybe', 'null']) {
      expect(isKilled('cache', { KILL_SWITCH_CACHE: raw } as unknown as NodeJS.ProcessEnv)).toBe(
        false,
      )
    }
  })

  it('returns the degraded value instead of calling the subsystem', async () => {
    const operation = vi.fn()
    const result = await withKillSwitch('search', operation, () => ({ results: [] }), {
      KILL_SWITCH_SEARCH: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(operation).not.toHaveBeenCalled()
    expect(result).toEqual({ results: [] })
  })

  it('calls the subsystem normally when the switch is off', async () => {
    const operation = vi.fn().mockResolvedValue({ results: ['a'] })
    const degraded = vi.fn()
    const result = await withKillSwitch(
      'search',
      operation,
      degraded,
      {} as unknown as NodeJS.ProcessEnv,
    )

    expect(operation).toHaveBeenCalledTimes(1)
    expect(degraded).not.toHaveBeenCalled()
    expect(result).toEqual({ results: ['a'] })
  })

  it('does not build the degraded value on the normal path', async () => {
    const degraded = vi.fn(() => ({ results: [] }))
    await withKillSwitch(
      'recs',
      async () => ({ results: ['a'] }),
      degraded,
      {} as unknown as NodeJS.ProcessEnv,
    )
    expect(degraded).not.toHaveBeenCalled()
  })

  it('reports every switch, so the health endpoint can show all four', () => {
    expect(killSwitchReport({ KILL_SWITCH_RECS: '1' } as unknown as NodeJS.ProcessEnv)).toEqual({
      cache: false,
      search: false,
      recs: true,
      notifications: false,
    })
  })
})
