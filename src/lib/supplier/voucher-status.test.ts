import { describe, expect, it } from 'vitest'
import {
  VOUCHER_STATUS_LABEL,
  type VoucherDisplayStatus,
  isScannable,
  voucherDisplayStatus,
} from './voucher-status'

const NOW = new Date('2026-08-19T12:00:00Z')

describe('voucherDisplayStatus', () => {
  it('shows an unexpired issued voucher as active', () => {
    expect(voucherDisplayStatus({ status: 'issued', expiresAt: '2026-09-01T00:00:00Z' }, NOW)).toBe(
      'active',
    )
  })

  it('shows an issued voucher past its expiry as expired, matching what a scan would do', () => {
    // The row still says issued; redeem_voucher would refuse it on expires_at.
    expect(voucherDisplayStatus({ status: 'issued', expiresAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(
      'expired',
    )
  })

  it('treats the exact expiry instant as expired, as the RPC does with expires_at > now()', () => {
    expect(voucherDisplayStatus({ status: 'issued', expiresAt: NOW.toISOString() }, NOW)).toBe(
      'expired',
    )
  })

  it('keeps terminal statuses even when the expiry has passed', () => {
    const past = '2026-08-01T00:00:00Z'
    expect(voucherDisplayStatus({ status: 'redeemed', expiresAt: past }, NOW)).toBe('redeemed')
    expect(voucherDisplayStatus({ status: 'cancelled', expiresAt: past }, NOW)).toBe('cancelled')
    expect(voucherDisplayStatus({ status: 'refunded', expiresAt: past }, NOW)).toBe('refunded')
  })

  it('falls back to active for an issued voucher with no expiry', () => {
    expect(voucherDisplayStatus({ status: 'issued', expiresAt: null }, NOW)).toBe('active')
  })

  it('never calls an unknown status usable', () => {
    expect(voucherDisplayStatus({ status: 'something_new', expiresAt: null }, NOW)).toBe('expired')
    expect(
      isScannable(voucherDisplayStatus({ status: 'something_new', expiresAt: null }, NOW)),
    ).toBe(false)
  })

  it('marks only active as scannable', () => {
    expect(isScannable('active')).toBe(true)
    for (const s of ['redeemed', 'expired', 'cancelled', 'refunded'] as VoucherDisplayStatus[]) {
      expect(isScannable(s)).toBe(false)
    }
  })

  it('labels every status in Hebrew', () => {
    for (const s of [
      'active',
      'redeemed',
      'expired',
      'cancelled',
      'refunded',
    ] as VoucherDisplayStatus[]) {
      expect(VOUCHER_STATUS_LABEL[s]).toBeTruthy()
    }
  })
})
