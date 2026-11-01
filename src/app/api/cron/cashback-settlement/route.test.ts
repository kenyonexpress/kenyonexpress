import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The nightly settlement's contract: unreachable without the secret (it
 * moves money from the reserve into customer wallets on a public URL), a
 * failed read answers 500, and per-order failures inside a committed run
 * answer 200 with the count, because the orders that settled are settled.
 */

const { settleCashback } = vi.hoisted(() => ({ settleCashback: vi.fn() }))

vi.mock('@/server/cashback/settlement', () => ({ settleCashback }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/cashback-settlement', {
    headers: auth ? { authorization: auth } : {},
  })
}

const CLEAN = {
  scanned: 4,
  itemCredited: 0,
  itemCreditedAgorot: 0,
  bonusAwarded: 0,
  bonusAwardedAgorot: 0,
  bonusNotOwed: 0,
  deferred: 0,
  errors: 0,
}

describe('cashback-settlement cron', () => {
  beforeEach(() => {
    settleCashback.mockReset().mockResolvedValue(CLEAN)
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(settleCashback).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(settleCashback).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(settleCashback).not.toHaveBeenCalled()
    })
  })

  it('reports the summary as-is on a clean night', async () => {
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, ...CLEAN })
  })

  it('answers 200 with the counts when some orders failed, because the rest settled', async () => {
    settleCashback.mockResolvedValue({
      ...CLEAN,
      itemCredited: 2,
      itemCreditedAgorot: 800,
      errors: 1,
    })
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, itemCredited: 2, errors: 1 })
  })

  it('answers 500 when the reads fail, so the run is retried', async () => {
    settleCashback.mockRejectedValue(new Error('orders window read failed: boom'))
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, error: 'orders window read failed: boom' })
  })
})
