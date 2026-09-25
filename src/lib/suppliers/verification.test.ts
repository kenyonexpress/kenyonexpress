import { NOT_VERIFIED, decideSupplierVerification } from '@/lib/suppliers/verification'
import { describe, expect, it } from 'vitest'

const active = { status: 'active', deletedAt: null, approvedApplication: null, redeemedVouchers: 0 }

describe('decideSupplierVerification', () => {
  it('does not verify a supplier on status alone: active is the column default', () => {
    expect(decideSupplierVerification(active)).toEqual(NOT_VERIFIED)
  })

  it('verifies on an approved application', () => {
    expect(decideSupplierVerification({ ...active, approvedApplication: true })).toEqual({
      verified: true,
      basis: 'approved_application',
    })
  })

  it('verifies on one real redemption at the counter', () => {
    expect(decideSupplierVerification({ ...active, redeemedVouchers: 1 })).toEqual({
      verified: true,
      basis: 'redeemed_voucher',
    })
  })

  it('names the human decision first when both facts hold', () => {
    expect(
      decideSupplierVerification({ ...active, approvedApplication: true, redeemedVouchers: 4 })
        .basis,
    ).toBe('approved_application')
  })

  it('treats a missing applications table as no evidence, not as approval', () => {
    expect(decideSupplierVerification({ ...active, approvedApplication: null }).verified).toBe(
      false,
    )
    expect(decideSupplierVerification({ ...active, approvedApplication: false }).verified).toBe(
      false,
    )
  })

  it('never verifies a suspended, closed or deleted supplier, whatever it earned', () => {
    for (const status of ['suspended', 'closed', 'inactive', null]) {
      expect(
        decideSupplierVerification({
          ...active,
          status,
          approvedApplication: true,
          redeemedVouchers: 9,
        }).verified,
      ).toBe(false)
    }
    expect(
      decideSupplierVerification({
        ...active,
        deletedAt: '2026-09-01T00:00:00Z',
        approvedApplication: true,
      }).verified,
    ).toBe(false)
  })

  it('ignores a malformed redemption count', () => {
    expect(decideSupplierVerification({ ...active, redeemedVouchers: Number.NaN }).verified).toBe(
      false,
    )
    expect(decideSupplierVerification({ ...active, redeemedVouchers: -1 }).verified).toBe(false)
  })
})
