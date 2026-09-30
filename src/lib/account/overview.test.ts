import { CHANNELS, OPTIONAL_KINDS, type PreferenceRow } from '@/lib/notifications/preferences'
import type { AccountAddress, AccountPaymentToken } from '@/server/queries/account'
import { describe, expect, it } from 'vitest'
import {
  addressLine,
  cardLabel,
  expiryLabel,
  isCardExpired,
  preferenceSummaryLine,
  summarizeAddresses,
  summarizePaymentMethods,
  summarizePreferences,
} from './overview'

function address(over: Partial<AccountAddress> = {}): AccountAddress {
  return {
    id: 'a1',
    fullName: 'ישראל ישראלי',
    phone: '0501234567',
    street: 'הרצל',
    streetNumber: '12',
    apartment: null,
    entrance: null,
    floor: null,
    city: 'תל אביב',
    zip: null,
    notesForCourier: null,
    isDefault: false,
    ...over,
  }
}

function card(over: Partial<AccountPaymentToken> = {}): AccountPaymentToken {
  return {
    id: 't1',
    last4: '1234',
    cardBrand: 'Visa',
    expiryMonth: 12,
    expiryYear: 2030,
    isDefault: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('addressLine', () => {
  it('joins street, number and city, dropping blanks', () => {
    expect(addressLine(address())).toBe('הרצל 12, תל אביב')
    expect(addressLine(address({ streetNumber: null }))).toBe('הרצל, תל אביב')
    expect(addressLine(address({ street: '', streetNumber: null }))).toBe('תל אביב')
  })
})

describe('summarizeAddresses', () => {
  it('prefers the default, else the first, else none', () => {
    const a = address({ id: 'a' })
    const b = address({ id: 'b', isDefault: true })
    expect(summarizeAddresses([a, b])).toEqual({ count: 2, primary: b })
    expect(summarizeAddresses([a])).toEqual({ count: 1, primary: a })
    expect(summarizeAddresses([])).toEqual({ count: 0, primary: null })
  })
})

describe('cardLabel', () => {
  it('shows brand and the last four digits only', () => {
    expect(cardLabel(card())).toBe('Visa ···· 1234')
    expect(cardLabel(card({ cardBrand: null, last4: null }))).toBe('כרטיס אשראי ···· ****')
  })

  it('never widens past four characters, whatever the column holds', () => {
    expect(cardLabel(card({ last4: '4580123412341234' }))).toBe('Visa ···· 1234')
  })
})

describe('card expiry', () => {
  const now = new Date(2026, 9, 1) // October 2026

  it('is valid through the last day of the expiry month', () => {
    expect(isCardExpired(10, 2026, now)).toBe(false)
    expect(isCardExpired(9, 2026, now)).toBe(true)
    expect(isCardExpired(1, 2027, now)).toBe(false)
  })

  it('treats a missing expiry as live', () => {
    expect(isCardExpired(null, 2026, now)).toBe(false)
    expect(isCardExpired(3, null, now)).toBe(false)
  })

  it('labels the expiry as MM/YY', () => {
    expect(expiryLabel(3, 2027)).toBe('תוקף 03/27')
    expect(expiryLabel(null, null)).toBe('')
  })
})

describe('summarizePaymentMethods', () => {
  const now = new Date(2026, 9, 1)

  it('prefers the default card and counts the live ones', () => {
    const dead = card({ id: 'dead', expiryMonth: 1, expiryYear: 2026 })
    const dflt = card({ id: 'dflt', isDefault: true })
    const out = summarizePaymentMethods([dead, dflt], now)
    expect(out).toEqual({ count: 2, live: 1, primary: dflt, primaryExpired: false })
  })

  it('falls back to the first card and flags it when expired', () => {
    const dead = card({ id: 'dead', expiryMonth: 1, expiryYear: 2026 })
    expect(summarizePaymentMethods([dead], now)).toEqual({
      count: 1,
      live: 0,
      primary: dead,
      primaryExpired: true,
    })
    expect(summarizePaymentMethods([], now)).toEqual({
      count: 0,
      live: 0,
      primary: null,
      primaryExpired: false,
    })
  })
})

describe('summarizePreferences', () => {
  // Derived, not written down: STEP 16 added `order_delivered` and a literal
  // 20 here went red for a reason that had nothing to do with this module.
  const TOTAL = OPTIONAL_KINDS.length * CHANNELS.length

  it('counts nothing off when nothing was decided', () => {
    const out = summarizePreferences([])
    expect(out.off).toBe(0)
    expect(out.total).toBe(TOTAL)
    expect(preferenceSummaryLine(out)).toBe('כל ההתראות פועלות')
  })

  it('counts switched-off optional rows per channel', () => {
    const rows: PreferenceRow[] = [
      { kind: 'order_shipped', channel: 'email', enabled: false },
      { kind: 'welcome', channel: 'push', enabled: false },
      { kind: 'voucher_expiring', channel: 'email', enabled: true },
    ]
    const out = summarizePreferences(rows)
    expect(out.off).toBe(2)
    expect(preferenceSummaryLine(out)).toBe(`2 התראות כבויות מתוך ${TOTAL}`)
    expect(preferenceSummaryLine({ total: TOTAL, off: 1 })).toBe('התראה אחת כבויה')
  })

  it('ignores a stray row for a required kind, like the senders do', () => {
    const rows: PreferenceRow[] = [{ kind: 'order_paid', channel: 'email', enabled: false }]
    expect(summarizePreferences(rows).off).toBe(0)
  })
})
