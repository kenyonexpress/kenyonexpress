import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkRateLimit = vi.hoisted(() => vi.fn())
const headersMock = vi.hoisted(() => vi.fn())
const recordRefusedScan = vi.hoisted(() => vi.fn())

vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('next/headers', () => ({ headers: headersMock }))
vi.mock('@/server/domain/vouchers/scan-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domain/vouchers/scan-context')>()
  return { ...actual, recordRefusedScan }
})

import { RedeemTokenBody } from './page'

/**
 * The per-address ceiling ahead of any signature check (M13-c51). The
 * comment at page.tsx:96 explains why it exists — an anonymous caller with no
 * session yet could otherwise verify signatures and write audit rows as fast
 * as it liked — but nothing exercised the branch where `checkRateLimit`
 * actually says no.
 */
describe('/redeem/[token]: the per-address rate limit', () => {
  beforeEach(() => {
    checkRateLimit.mockReset()
    headersMock.mockReset()
    recordRefusedScan.mockReset()
    headersMock.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.5' }))
  })

  it('refuses the scan once the 60/hour ceiling is hit, before the signature is checked', async () => {
    checkRateLimit.mockResolvedValue(false)
    const element = await RedeemTokenBody({ params: Promise.resolve({ token: 'KEV1.forged' }) })
    expect(checkRateLimit).toHaveBeenCalledWith('redeem:203.0.113.5', 60, 3600)
    expect(element.props).toMatchObject({
      title: 'יותר מדי נסיונות',
    })
    expect(element.props.detail).toMatch(/יותר מדי סריקות/)
    // Refused before the signature check, so no scan is logged for it.
    expect(recordRefusedScan).not.toHaveBeenCalled()
  })

  it('is skipped entirely with no address to key it on', async () => {
    headersMock.mockResolvedValue(new Headers())
    checkRateLimit.mockResolvedValue(false)
    await RedeemTokenBody({ params: Promise.resolve({ token: 'KEV1.forged' }) })
    expect(checkRateLimit).not.toHaveBeenCalled()
  })
})
