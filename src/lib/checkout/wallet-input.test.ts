import { describe, expect, it } from 'vitest'
import { clampWalletIls } from './wallet-input'

describe('clampWalletIls', () => {
  it('caps at the ceiling, which is what min/max on the input never did', () => {
    // The measured case: balance ₪500, order ₪50. Under the old form this
    // posted 500 and came back "RangeError: wallet applied must not exceed the
    // on-site charge", in English, with a retry button that could not work.
    expect(clampWalletIls('500', 50)).toBe('50')
  })

  it('floors a negative at zero', () => {
    // The server treats a negative as "no wallet" (`if (apply_wallet_ils > 0)`)
    // and says nothing, so the shopper who typed -50 was told their wallet had
    // been applied and it had not.
    expect(clampWalletIls('-50', 100)).toBe('0')
    expect(clampWalletIls('-0.01', 100)).toBe('0')
  })

  it('keeps agorot and rounds below them', () => {
    expect(clampWalletIls('12.34', 100)).toBe('12.34')
    // The server does `.toFixed(2)` on whatever arrives, so a third decimal is
    // rounded there either way. Doing it here means the field shows what will
    // be charged instead of contradicting it.
    expect(clampWalletIls('12.345', 100)).toBe('12.35')
    expect(clampWalletIls('0.004', 100)).toBe('0')
  })

  it('leaves an empty field empty rather than writing a 0 into it', () => {
    // Typing over the value clears it for an instant. Rewriting '0' there on
    // every keystroke would fight the shopper's cursor.
    expect(clampWalletIls('', 100)).toBe('')
    expect(clampWalletIls('   ', 100)).toBe('')
  })

  it('refuses a value that is not a number', () => {
    expect(clampWalletIls('e', 100)).toBe('')
    expect(clampWalletIls('1-2', 100)).toBe('')
  })

  it('clamps to zero when there is nothing to spend', () => {
    // `walletMaxIls` is min(balance, subtotal), so a zero ceiling is reachable
    // whenever the on-site charge is zero - a cart of coupons paid entirely at
    // the business.
    expect(clampWalletIls('10', 0)).toBe('0')
    expect(clampWalletIls('10', -1)).toBe('0')
  })

  it('passes a value already inside the range through untouched', () => {
    expect(clampWalletIls('25', 100)).toBe('25')
    expect(clampWalletIls('100', 100)).toBe('100')
  })
})
