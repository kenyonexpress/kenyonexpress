import {
  MOCK_TRANSACTION_PREFIX,
  isMockTransactionId,
  isRealChargeId,
} from '@/lib/payments/mock-transaction-id'
import { describe, expect, it } from 'vitest'

describe('isMockTransactionId', () => {
  it('recognises every id shape the mock provider mints', () => {
    for (const id of ['mock-txn-1', 'mock-tok-12', 'mock-refund-3', 'mock-cancel-4']) {
      expect(isMockTransactionId(id)).toBe(true)
    }
  })

  it('does not treat a real Cardcom id or an absent one as mock', () => {
    expect(isMockTransactionId('123456789')).toBe(false)
    expect(isMockTransactionId(null)).toBe(false)
    expect(isMockTransactionId(undefined)).toBe(false)
    expect(isMockTransactionId('')).toBe(false)
  })
})

describe('isRealChargeId', () => {
  it('needs a non-empty id that is not the mock prefix', () => {
    expect(isRealChargeId('123456789')).toBe(true)
    expect(isRealChargeId(`${MOCK_TRANSACTION_PREFIX}txn-9`)).toBe(false)
    expect(isRealChargeId(null)).toBe(false)
    expect(isRealChargeId('')).toBe(false)
  })
})
