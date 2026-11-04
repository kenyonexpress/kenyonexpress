import { describe, expect, it } from 'vitest'
import {
  WALLET_LEDGER_SELECT_AGOROT,
  WALLET_LEDGER_SELECT_ILS,
  type WalletLedgerDbRow,
  ledgerNetAgorot,
  ledgerRowToEntry,
} from './ledger'

const base: WalletLedgerDbRow = {
  id: 'e1',
  direction: 'credit',
  reason: 'order_cashback',
  order_id: 'o1',
  created_at: '2026-11-04T10:00:00Z',
}

describe('ledgerRowToEntry: one ledger row in integer agorot', () => {
  it('reads the 260 agorot columns when present', () => {
    const e = ledgerRowToEntry({ ...base, amount_agorot: 820, signed_amount_agorot: 820 })
    expect(e.amountAgorot).toBe(820)
    expect(e.signedAmountAgorot).toBe(820)
    expect(e.direction).toBe('credit')
  })

  it('a debit is negative in the signed column and positive in the magnitude', () => {
    const e = ledgerRowToEntry({
      ...base,
      direction: 'debit',
      amount_agorot: 1_500,
      signed_amount_agorot: -1_500,
    })
    expect(e.amountAgorot).toBe(1_500)
    expect(e.signedAmountAgorot).toBe(-1_500)
  })

  // The pre-260 shape. 8.20 * 100 is 819.9999999999999 in floats; the parse is exact.
  it('falls back to parsing the decimal pair, exactly', () => {
    const e = ledgerRowToEntry({ ...base, amount_ils: '8.20', signed_amount_ils: '8.20' })
    expect(e.amountAgorot).toBe(820)
    expect(e.signedAmountAgorot).toBe(820)
    const d = ledgerRowToEntry({
      ...base,
      direction: 'debit',
      amount_ils: 8.2,
      signed_amount_ils: -8.2,
    })
    expect(d.signedAmountAgorot).toBe(-820)
  })

  it('accepts a stringified bigint and refuses a fractional "agorot" value', () => {
    expect(
      ledgerRowToEntry({ ...base, amount_agorot: '820', amount_ils: '8.20' }).amountAgorot,
    ).toBe(820)
    const e = ledgerRowToEntry({ ...base, amount_agorot: 819.5, amount_ils: '8.20' })
    expect(e.amountAgorot).toBe(820)
  })

  it('derives the sign from the direction when no signed column came back', () => {
    const e = ledgerRowToEntry({ ...base, direction: 'debit', amount_agorot: 300 })
    expect(e.signedAmountAgorot).toBe(-300)
  })

  it('an unknown direction is a debit, never a silent credit', () => {
    const e = ledgerRowToEntry({ ...base, direction: null, amount_agorot: 300 })
    expect(e.direction).toBe('debit')
  })
})

describe('ledgerNetAgorot', () => {
  it('is an integer sum of the signed entries', () => {
    const rows = [
      ledgerRowToEntry({ ...base, id: 'a', amount_ils: '0.10', signed_amount_ils: '0.10' }),
      ledgerRowToEntry({ ...base, id: 'b', amount_ils: '0.20', signed_amount_ils: '0.20' }),
      ledgerRowToEntry({
        ...base,
        id: 'c',
        direction: 'debit',
        amount_agorot: 5,
        signed_amount_agorot: -5,
      }),
    ]
    // 0.1 + 0.2 in floats is 0.30000000000000004; in agorot it is 30.
    expect(ledgerNetAgorot(rows)).toBe(25)
  })

  it('is zero for no entries', () => {
    expect(ledgerNetAgorot([])).toBe(0)
  })
})

describe('the two selects', () => {
  it('the first read names the agorot pair and the fallback does not', () => {
    expect(WALLET_LEDGER_SELECT_AGOROT).toContain('signed_amount_agorot')
    expect(WALLET_LEDGER_SELECT_AGOROT).toContain('amount_agorot')
    expect(WALLET_LEDGER_SELECT_ILS).not.toContain('agorot')
  })
})
