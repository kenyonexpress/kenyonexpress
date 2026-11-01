import {
  CONTRACT_TEXT,
  CONTRACT_VERSION,
  contractHash,
  contractVersionMatches,
} from '@/lib/suppliers/contract'
import { describe, expect, it } from 'vitest'

describe('contractHash', () => {
  it('is a 64-character lowercase hex string, which is what the CHECK requires', () => {
    // 204: CHECK (contract_sha256 ~ '^[0-9a-f]{64}$'). Uppercase hex would be
    // refused by the database at the moment somebody accepts the terms.
    expect(contractHash()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable for the same text and different for one changed character', () => {
    expect(contractHash(CONTRACT_TEXT)).toBe(contractHash(CONTRACT_TEXT))
    expect(contractHash(`${CONTRACT_TEXT} `)).not.toBe(contractHash(CONTRACT_TEXT))
  })

  it('changes when a clause changes, which is the entire point of storing it', () => {
    const edited = CONTRACT_TEXT.replace('5%', '15%')
    expect(edited).not.toBe(CONTRACT_TEXT)
    expect(contractHash(edited)).not.toBe(contractHash())
  })
})

describe('contractVersionMatches', () => {
  it('accepts the current version and refuses anything else', () => {
    expect(contractVersionMatches(CONTRACT_VERSION)).toBe(true)
    expect(contractVersionMatches('v0')).toBe(false)
    expect(contractVersionMatches(null)).toBe(false)
    expect(contractVersionMatches(undefined)).toBe(false)
    expect(contractVersionMatches('')).toBe(false)
  })
})

describe('the contract text', () => {
  it('names its own version, so a printed copy identifies itself', () => {
    expect(CONTRACT_TEXT).toContain(CONTRACT_VERSION)
  })

  it('states the cancellation rule as computeCancellationFee implements it', () => {
    // The clause and the code have to agree. If the statute moves, both move.
    expect(CONTRACT_TEXT).toContain('5%')
    expect(CONTRACT_TEXT).toContain('₪100')
    expect(CONTRACT_TEXT).toContain('ההחזר מלא')
  })

  it('states the rules this codebase can actually demonstrate', () => {
    // Commission snapshotted at purchase, a redeemed voucher not refundable,
    // and the bank number not kept as a visible field. Each is a property of
    // the code, not a promise somebody wrote.
    expect(CONTRACT_TEXT).toContain('צילום בזמן ההזמנה')
    expect(CONTRACT_TEXT).toContain('שובר שמומש אינו ניתן לביטול')
    expect(CONTRACT_TEXT).toContain('ארבע הספרות האחרונות')
  })

  it('is Hebrew and long enough to be a real document', () => {
    expect(CONTRACT_TEXT).toMatch(/[֐-׿]/)
    expect(CONTRACT_TEXT.length).toBeGreaterThan(1000)
  })
})
