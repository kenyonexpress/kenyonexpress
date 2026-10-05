import { referralFingerprint } from '@/lib/referrals/fingerprint'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The click recorder writes one row with hashed fingerprints, never raw
 * values, and never lets a failure out: the proxy hands it to waitUntil and
 * nothing may reject there.
 */

const insertMock = vi.fn()
const fromMock = vi.fn(() => ({ insert: insertMock }))
const createAdminClientMock = vi.fn(() => ({ from: fromMock }))
const logInfo = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    info: (...args: unknown[]) => logInfo(...args),
    warn: (...args: unknown[]) => logWarn(...args),
    error: vi.fn(),
  },
}))

import { deviceIdFromToken, landingPath, recordAffiliateClick } from './clicks'

const UUID = '8f3b1c2a-5d6e-4f70-8a9b-0c1d2e3f4a5b'

beforeEach(() => {
  insertMock.mockReset()
  fromMock.mockClear()
  createAdminClientMock.mockClear()
  logInfo.mockReset()
  logWarn.mockReset()
  insertMock.mockResolvedValue({ error: null })
})

describe('recordAffiliateClick', () => {
  it('writes the normalised code, the bare path and hashed fingerprints', async () => {
    await recordAffiliateClick({
      code: ' abcd2345 ',
      pathname: '/product/some-slug',
      ip: '203.0.113.9',
      deviceToken: `${UUID}.signature`,
    })
    expect(fromMock).toHaveBeenCalledWith('affiliate_clicks')
    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row.code).toBe('ABCD2345')
    expect(row.landing_path).toBe('/product/some-slug')
    expect(row.ip_fingerprint).toBe(referralFingerprint('ip', '203.0.113.9'))
    expect(row.device_fingerprint).toBe(referralFingerprint('device', UUID))
    expect(JSON.stringify(row)).not.toContain('203.0.113.9')
    expect(JSON.stringify(row)).not.toContain(UUID)
  })

  it('writes nothing for a value that is not a code', async () => {
    await recordAffiliateClick({ code: 'not-a-code', pathname: '/', ip: null, deviceToken: null })
    await recordAffiliateClick({ code: null, pathname: '/', ip: null, deviceToken: null })
    expect(createAdminClientMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('logs a missing 252 once per process and keeps going', async () => {
    insertMock.mockResolvedValue({ error: { code: '42P01', message: 'relation does not exist' } })
    await recordAffiliateClick({ code: 'ABCD2345', pathname: '/', ip: null, deviceToken: null })
    await recordAffiliateClick({ code: 'ABCD2345', pathname: '/', ip: null, deviceToken: null })
    expect(logInfo).toHaveBeenCalledTimes(1)
    expect(logInfo.mock.calls[0]?.[0]).toBe('affiliates.clicks_table_missing')
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('never rejects: a thrown client is one warning', async () => {
    createAdminClientMock.mockImplementationOnce(() => {
      throw new Error('SUPABASE_SECRET_KEY is not set')
    })
    await expect(
      recordAffiliateClick({ code: 'ABCD2345', pathname: '/', ip: null, deviceToken: null }),
    ).resolves.toBeUndefined()
    expect(logWarn).toHaveBeenCalledWith('affiliates.click_threw', {
      reason: 'SUPABASE_SECRET_KEY is not set',
    })
  })

  it('reports any other write error without throwing', async () => {
    insertMock.mockResolvedValue({ error: { code: '23514', message: 'check violation' } })
    await recordAffiliateClick({ code: 'ABCD2345', pathname: '/', ip: null, deviceToken: null })
    expect(logWarn).toHaveBeenCalledWith('affiliates.click_write_failed', {
      reason: 'check violation',
    })
  })
})

describe('landingPath', () => {
  it('drops the query, keeps a leading slash and bounds the length', () => {
    expect(landingPath('/product/x?ref=ABCD2345')).toBe('/product/x')
    expect(landingPath('product/x')).toBe('/product/x')
    expect(landingPath('')).toBe('/')
    expect(landingPath(`/${'a'.repeat(600)}`)).toHaveLength(512)
  })
})

describe('deviceIdFromToken', () => {
  it('reduces a signed token to its uuid and refuses anything else', () => {
    expect(deviceIdFromToken(UUID)).toBe(UUID)
    expect(deviceIdFromToken(`${UUID}.sig`)).toBe(UUID)
    expect(deviceIdFromToken('garbage')).toBeNull()
    expect(deviceIdFromToken(null)).toBeNull()
  })
})
