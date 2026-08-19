import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The nightly voucher lifecycle job.
 *
 * WHAT IS ACTUALLY AT RISK HERE. The three RPCs are not interchangeable steps
 * that happen to be written in a row. Step 1 changes statuses and moves no
 * money. Step 2 credits a customer's wallet with what they paid online for a
 * voucher that expired unscanned, which is decision C6: expiry is not
 * forfeiture. Step 3 mails a reminder and touches nothing.
 *
 * The order and the failure handling encode that difference, and every one of
 * those decisions was reversible by a one-line edit that no test would notice:
 * moving the reminder ahead of the sweep would remind people about coupons that
 * are about to be expired by the very next statement; letting the reminder's
 * failure return 500 would make Vercel retry a run whose money legs already
 * committed; letting step 2's failure hide `expired` would read as "nothing
 * happened" to whoever debugs it next.
 *
 * None of this is reachable from the pure unit tests, because all of it lives
 * in the route.
 */

const rpc = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc }),
}))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/expire-vouchers', {
    headers: auth ? { authorization: auth } : {},
  })
}

/** Names of the RPCs called, in the order they were called. */
function callOrder(): string[] {
  return rpc.mock.calls.map((call) => call[0] as string)
}

const EXPIRE = 'expire_vouchers'
const CREDIT = 'credit_expired_vouchers'
const REMIND = 'enqueue_expiring_voucher_notices'

/** Every RPC succeeds, with a distinguishable count each. */
function allSucceed() {
  rpc.mockImplementation((fn: string) => {
    if (fn === EXPIRE) return Promise.resolve({ data: 3, error: null })
    if (fn === CREDIT) return Promise.resolve({ data: 2, error: null })
    return Promise.resolve({ data: 9, error: null })
  })
}

describe('voucher expiry cron', () => {
  beforeEach(() => {
    rpc.mockReset()
    allSucceed()
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
      // This job credits wallets. An unconfigured deploy must not be an open
      // one, and `bearerMatches` refusing an empty expected secret is the only
      // thing standing between the two.
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('the happy path', () => {
    it('runs the sweep, then the credit, then the reminders', async () => {
      await GET(request('Bearer s3cret'))
      expect(callOrder()).toEqual([EXPIRE, CREDIT, REMIND])
    })

    it('reports each step separately, because they mean different things', async () => {
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body).toEqual({ ok: true, expired: 3, credited: 2, reminders: 9 })
    })

    it('asks the two money RPCs for everything due, with no arguments', async () => {
      // `expire_vouchers()` sweeps every due row and `credit_expired_vouchers()`
      // caps itself at 500 internally, so a backlog drains over consecutive
      // runs. Passing a limit from here would put that cap in two places.
      await GET(request('Bearer s3cret'))
      expect(rpc).toHaveBeenNthCalledWith(1, EXPIRE)
      expect(rpc).toHaveBeenNthCalledWith(2, CREDIT)
    })

    it('reminds at seven days and at one day', async () => {
      await GET(request('Bearer s3cret'))
      expect(rpc).toHaveBeenNthCalledWith(3, REMIND, { p_buckets: [7, 1] })
    })

    it('sweeps BEFORE reminding, so nobody is mailed about a coupon that just died', async () => {
      // `enqueue_expiring_voucher_notices` only looks at `issued` rows, so the
      // sweep running first is what keeps a just-expired voucher out of its way.
      // Reversing these two lines is invisible in every other assertion here.
      const order = callOrder.bind(null)
      await GET(request('Bearer s3cret'))
      expect(order().indexOf(EXPIRE)).toBeLessThan(order().indexOf(REMIND))
    })
  })

  describe('when the sweep itself fails', () => {
    beforeEach(() => {
      rpc.mockImplementation((fn: string) =>
        fn === EXPIRE
          ? Promise.resolve({ data: null, error: { message: 'deadlock detected' } })
          : Promise.resolve({ data: 0, error: null }),
      )
    })

    it('answers 500 so the run is retried', async () => {
      expect((await GET(request('Bearer s3cret'))).status).toBe(500)
    })

    it('does not credit anybody off a sweep that did not happen', async () => {
      await GET(request('Bearer s3cret'))
      expect(callOrder()).toEqual([EXPIRE])
    })
  })

  describe('when the wallet credit fails after the sweep committed', () => {
    beforeEach(() => {
      rpc.mockImplementation((fn: string) => {
        if (fn === EXPIRE) return Promise.resolve({ data: 4, error: null })
        if (fn === CREDIT)
          return Promise.resolve({ data: null, error: { message: 'ledger unavailable' } })
        return Promise.resolve({ data: 0, error: null })
      })
    })

    it('answers 500, because the customers are still owed the credit', async () => {
      expect((await GET(request('Bearer s3cret'))).status).toBe(500)
    })

    it('still says how many it expired, so the 500 is not read as "nothing happened"', async () => {
      // The sweep committed. A response that omitted it would invite somebody
      // to re-run the sweep looking for the rows it already moved.
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body).toMatchObject({ ok: false, expired: 4, credited: 0 })
    })

    it('does not send reminders on a run that is about to be retried', async () => {
      await GET(request('Bearer s3cret'))
      expect(callOrder()).toEqual([EXPIRE, CREDIT])
    })
  })

  describe('when only the reminders fail', () => {
    beforeEach(() => {
      rpc.mockImplementation((fn: string) => {
        if (fn === EXPIRE) return Promise.resolve({ data: 5, error: null })
        if (fn === CREDIT) return Promise.resolve({ data: 6, error: null })
        return Promise.resolve({ data: null, error: { message: 'outbox down' } })
      })
    })

    it('answers 200, because a retry would re-run two money legs to fix a mailer', async () => {
      // This is the whole reason the reminder is step 3. `credit_expired_vouchers`
      // is idempotent per voucher, but making Vercel retry the money path to
      // recover an email is the wrong trade in either direction.
      const response = await GET(request('Bearer s3cret'))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, expired: 5, credited: 6, reminders: 0 })
    })
  })

  describe('the shape of the counts', () => {
    it('reports zero reminders rather than null when the RPC returns nothing', async () => {
      rpc.mockImplementation((fn: string) =>
        fn === REMIND
          ? Promise.resolve({ data: null, error: null })
          : Promise.resolve({ data: 0, error: null }),
      )
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body.reminders).toBe(0)
    })
  })
})
