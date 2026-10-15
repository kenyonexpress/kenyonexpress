import {
  BANKS,
  type BankDetailsCheck,
  bankByCode,
  bankSecretPayload,
  checkBankDetails,
  maskedAccount,
} from '@/lib/suppliers/bank-account'
import { describe, expect, it } from 'vitest'

const valid = {
  bankCode: '12',
  branch: '123',
  accountNumber: '123456',
  accountHolder: 'עסק בע"מ',
}

const fail = (result: BankDetailsCheck) => result as Extract<BankDetailsCheck, { ok: false }>

describe('checkBankDetails', () => {
  it('accepts well-formed details and reports only the safe parts', () => {
    const result = checkBankDetails(valid)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.bankName).toBe('בנק הפועלים')
      expect(result.last4).toBe('3456')
      expect(result.branch).toBe('123')
    }
  })

  it('pads the branch, so 12 and 012 are one branch and not two', () => {
    const result = checkBankDetails({ ...valid, branch: '12' })
    expect(result.ok && result.branch).toBe('012')
  })

  it('names an unknown bank rather than accepting a code nothing will pay into', () => {
    const result = fail(checkBankDetails({ ...valid, bankCode: '77' }))
    expect(result.field).toBe('bankCode')
    expect(result.message).toMatch(/[֐-׿]/)
  })

  it('refuses an account of the wrong length and says what the length is', () => {
    // The usual cause is dropped leading zeros, so the message has to name the
    // expected length rather than say "invalid".
    const result = fail(checkBankDetails({ ...valid, accountNumber: '12345' }))
    expect(result.field).toBe('accountNumber')
    expect(result.message).toContain('ספרות')
    expect(result.message).toContain('אפסים')
  })

  it('refuses a non-numeric account and a missing holder', () => {
    expect(fail(checkBankDetails({ ...valid, accountNumber: '12a456' })).field).toBe(
      'accountNumber',
    )
    expect(fail(checkBankDetails({ ...valid, accountHolder: ' ' })).field).toBe('accountHolder')
  })

  it('tolerates the separators people type in an account number', () => {
    expect(checkBankDetails({ ...valid, accountNumber: '123-456' }).ok).toBe(true)
    expect(checkBankDetails({ ...valid, accountNumber: ' 123 456 ' }).ok).toBe(true)
  })

  it('accepts a two-digit code written with a leading zero', () => {
    expect(checkBankDetails({ ...valid, bankCode: '9' }).ok).toBe(true)
    expect(bankByCode('9')?.code).toBe('09')
  })
})

describe('the bank list', () => {
  it('has unique codes and a Hebrew name for each', () => {
    const codes = BANKS.map((bank) => bank.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const bank of BANKS) {
      expect(bank.name, bank.code).toMatch(/[֐-׿A-Za-z]/)
      expect(bank.accountDigits.length, bank.code).toBeGreaterThan(0)
      expect(bank.code, bank.name).toMatch(/^\d{2}$/)
    }
  })
})

describe('bankSecretPayload', () => {
  it('carries the account number, which is why it goes to the vault and not a column', () => {
    const result = checkBankDetails(valid)
    if (!result.ok) throw new Error('fixture should be valid')
    const payload = bankSecretPayload(result)
    expect(payload).toContain('123456')
    expect(payload.split('|')).toHaveLength(4)
  })
})

describe('maskedAccount', () => {
  it('never renders more than the last four digits', () => {
    const masked = maskedAccount('בנק הפועלים', '123', '3456')
    expect(masked).toContain('****3456')
    expect(masked).not.toContain('123456')
  })
})
