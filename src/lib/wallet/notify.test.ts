import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pushGoogleObjectState = vi.fn()

vi.mock('./google-wallet', () => ({
  pushGoogleObjectState: (...args: unknown[]) => pushGoogleObjectState(...args),
}))

import { expireWalletPasses } from './notify'

const KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----'

function configure(): void {
  vi.stubEnv('GOOGLE_WALLET_ISSUER_ID', '3388000000000000000')
  vi.stubEnv('GOOGLE_WALLET_SA_EMAIL', 'wallet@example.iam.gserviceaccount.com')
  vi.stubEnv('GOOGLE_WALLET_SA_KEY_PEM', Buffer.from(KEY).toString('base64'))
}

beforeEach(() => {
  pushGoogleObjectState.mockReset().mockResolvedValue({ outcome: 'ok' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('expireWalletPasses', () => {
  it('expires the object named by the voucher code', () => {
    configure()
    return expireWalletPasses(['ABCDE12345']).then((summary) => {
      expect(summary).toEqual({ pushed: 1, failed: 0, skipped: 0 })
      const [objectId, patch] = pushGoogleObjectState.mock.calls[0] as [string, unknown]
      expect(objectId).toBe('3388000000000000000.ABCDE12345')
      expect(patch).toEqual({ state: 'EXPIRED' })
    })
  })

  it('counts an unconfigured deployment as skipped, never as pushed', async () => {
    // A push that reports success on a deployment with no credentials is the
    // one answer that would make the whole mechanism unfalsifiable.
    pushGoogleObjectState.mockResolvedValue({ outcome: 'skipped', reason: 'not_configured' })
    expect(await expireWalletPasses(['ABCDE12345'])).toEqual({
      pushed: 0,
      failed: 0,
      skipped: 1,
    })
  })

  it('does nothing at all for an empty list', async () => {
    configure()
    expect(await expireWalletPasses([])).toEqual({ pushed: 0, failed: 0, skipped: 0 })
    expect(pushGoogleObjectState).not.toHaveBeenCalled()
  })

  it('keeps going after one voucher fails, and reports both', async () => {
    configure()
    pushGoogleObjectState
      .mockResolvedValueOnce({ outcome: 'failed', reason: 'http_500' })
      .mockResolvedValueOnce({ outcome: 'ok' })
    expect(await expireWalletPasses(['AAAAA11111', 'BBBBB22222'])).toEqual({
      pushed: 1,
      failed: 1,
      skipped: 0,
    })
  })

  it('does not throw even when the push layer rejects outright', async () => {
    // It runs after the voucher is already burned. A throw here would turn a
    // display bug into a 500 at the counter, so "never throws" is asserted as a
    // property of this function and not inherited from the one it calls.
    configure()
    pushGoogleObjectState.mockRejectedValue(new Error('boom'))
    expect(await expireWalletPasses(['AAAAA11111'])).toEqual({
      pushed: 0,
      failed: 1,
      skipped: 0,
    })
  })
})
