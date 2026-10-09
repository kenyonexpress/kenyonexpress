import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The nightly cashback expiry sweep.
 *
 * WHAT IS ACTUALLY AT RISK HERE. The route holds no rule — `fn_cashback_expire`
 * decides everything in the database — so what these tests pin is the contract
 * around it: the sweep must be unreachable without the secret (it debits
 * customer wallets on a public URL), a failed RPC must answer 500 so the
 * scheduler retries a run that moved nothing, and per-user `errors` inside a
 * committed run must NOT fail the response, because the users who swept
 * cleanly are done and a retry would only no-op on them while the broken one
 * fails again. That last distinction is one `if` away from inverted and no
 * other test would notice.
 */

const rpc = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/expire-cashback', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('cashback expiry cron', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { swept: 2, amount_agorot: 4500, errors: 0 }, error: null })
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      // This job debits wallets. An unconfigured deploy must not be an open
      // one, and `bearerMatches` refusing an empty expected secret is the only
      // thing standing between the two.
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('the happy path', () => {
    it('calls the one RPC that owns the rule, with no arguments', async () => {
      // The 200-user cap lives inside `fn_cashback_expire`. Passing a limit
      // from here would put that cap in two places.
      await GET(request('Bearer s3cret'))
      expect(rpc).toHaveBeenCalledExactlyOnceWith('fn_cashback_expire')
    })

    it('reports what the sweep moved, in agorot', async () => {
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body).toEqual({ ok: true, swept: 2, amountAgorot: 4500, errors: 0 })
    })

    it('treats an empty result as a quiet night, not a failure', async () => {
      rpc.mockResolvedValue({ data: { swept: 0, amount_agorot: 0, errors: 0 }, error: null })
      const response = await GET(request('Bearer s3cret'))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, swept: 0, amountAgorot: 0, errors: 0 })
    })
  })

  describe('when the sweep itself fails', () => {
    beforeEach(() => {
      rpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } })
    })

    it('answers 500 so the run is retried', async () => {
      expect((await GET(request('Bearer s3cret'))).status).toBe(500)
    })

    it('says why', async () => {
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body).toEqual({ ok: false, error: 'deadlock detected' })
    })
  })

  describe('when some users failed inside a committed run', () => {
    it('answers 200 and surfaces the count, because the clean sweeps are done', async () => {
      // The function commits per user and reports stragglers in `errors`; they
      // are retried tomorrow by construction. A 500 here would make the
      // scheduler hammer a run that can only no-op on everyone who succeeded.
      rpc.mockResolvedValue({ data: { swept: 3, amount_agorot: 900, errors: 1 }, error: null })
      const response = await GET(request('Bearer s3cret'))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, swept: 3, amountAgorot: 900, errors: 1 })
    })
  })
})
