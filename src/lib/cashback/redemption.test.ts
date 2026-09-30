import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  MIN_WALLET_REDEMPTION_AGOROT,
  MIN_WALLET_REDEMPTION_ILS,
  canRedeemWallet,
  checkWalletRedemption,
  redeemableCeilingAgorot,
} from './redemption'

describe('the redemption floor', () => {
  it('is ₪10, stated once in agorot and once in shekels, and they agree', () => {
    expect(MIN_WALLET_REDEMPTION_AGOROT).toBe(1000)
    expect(MIN_WALLET_REDEMPTION_ILS * 100).toBe(MIN_WALLET_REDEMPTION_AGOROT)
  })
})

describe('redeemableCeilingAgorot', () => {
  it('is the smaller of balance and on-site charge', () => {
    expect(redeemableCeilingAgorot(agorot(50000), agorot(4000))).toBe(4000)
    expect(redeemableCeilingAgorot(agorot(1250), agorot(4000))).toBe(1250)
  })

  it('collapses to zero when the smaller of the two is under the floor', () => {
    // ₪9.99 in the wallet: nothing to redeem, no box to show.
    expect(redeemableCeilingAgorot(agorot(999), agorot(40000))).toBe(0)
    // A ₪5 cart against a fat wallet: same answer, the cart is the ceiling.
    expect(redeemableCeilingAgorot(agorot(50000), agorot(500))).toBe(0)
    expect(redeemableCeilingAgorot(agorot(0), agorot(40000))).toBe(0)
  })

  it('passes exactly the floor', () => {
    expect(redeemableCeilingAgorot(agorot(1000), agorot(1000))).toBe(1000)
  })

  it('refuses a float or a negative, which is not agorot', () => {
    expect(() => redeemableCeilingAgorot(12.5 as never, agorot(100))).toThrow(RangeError)
    expect(() => redeemableCeilingAgorot(agorot(100), -1 as never)).toThrow(RangeError)
  })
})

describe('canRedeemWallet', () => {
  it('mirrors the ceiling', () => {
    expect(canRedeemWallet(agorot(1000), agorot(1000))).toBe(true)
    expect(canRedeemWallet(agorot(999), agorot(100000))).toBe(false)
  })
})

describe('checkWalletRedemption', () => {
  it('accepts zero as "no wallet" without consulting anything', () => {
    expect(checkWalletRedemption(agorot(0), agorot(0), agorot(0))).toEqual({
      ok: true,
      agorot: 0,
    })
  })

  it('refuses a positive amount under the floor before looking at the balance', () => {
    // Balance and charge both allow it; the floor alone says no.
    expect(checkWalletRedemption(agorot(999), agorot(50000), agorot(50000))).toEqual({
      ok: false,
      code: 'BELOW_MINIMUM',
    })
    expect(checkWalletRedemption(agorot(1), agorot(50000), agorot(50000))).toEqual({
      ok: false,
      code: 'BELOW_MINIMUM',
    })
  })

  it('refuses more than the balance', () => {
    expect(checkWalletRedemption(agorot(1500), agorot(1200), agorot(50000))).toEqual({
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
    })
  })

  it('refuses more than the on-site charge, the case that used to surface as an English RangeError', () => {
    expect(checkWalletRedemption(agorot(5000), agorot(50000), agorot(4000))).toEqual({
      ok: false,
      code: 'EXCEEDS_CHARGE',
    })
  })

  it('accepts exactly the floor, exactly the balance and exactly the charge', () => {
    expect(checkWalletRedemption(agorot(1000), agorot(1000), agorot(1000))).toEqual({
      ok: true,
      agorot: 1000,
    })
    expect(checkWalletRedemption(agorot(4000), agorot(50000), agorot(4000))).toEqual({
      ok: true,
      agorot: 4000,
    })
  })
})
