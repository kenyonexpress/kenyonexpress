import { describe, expect, it } from 'vitest'
import { agorot } from './commerce/money'
import { type JournalLine, UnbalancedJournalError, assertBalanced, negateLines } from './ledger'
import { applyBp, bp, extractVat } from './money'

describe('assertBalanced', () => {
  it('passes a two-line balanced journal', () => {
    const lines: JournalLine[] = [
      { kind: 'cardcom_clearing', amountAgorot: 1000 },
      { kind: 'platform_revenue', amountAgorot: -1000 },
    ]
    expect(() => assertBalanced('t:1', lines)).not.toThrow()
  })

  it('throws on a non-zero sum', () => {
    const lines: JournalLine[] = [
      { kind: 'cardcom_clearing', amountAgorot: 1000 },
      { kind: 'platform_revenue', amountAgorot: -999 },
    ]
    expect(() => assertBalanced('t:2', lines)).toThrow(UnbalancedJournalError)
  })

  it('throws on empty and on a zero-amount line', () => {
    expect(() => assertBalanced('t:3', [])).toThrow(UnbalancedJournalError)
    expect(() =>
      assertBalanced('t:4', [
        { kind: 'platform_revenue', amountAgorot: 0 },
        { kind: 'cardcom_clearing', amountAgorot: 0 },
      ]),
    ).toThrow(TypeError)
  })
})

describe('negateLines', () => {
  it('flips every sign and stays balanced', () => {
    const lines: JournalLine[] = [
      { kind: 'supplier_payable', amountAgorot: -9000, supplierId: 's1' },
      { kind: 'cardcom_clearing', amountAgorot: 9000 },
    ]
    const reversed = negateLines(lines)
    expect(reversed.map((l) => l.amountAgorot)).toEqual([9000, -9000])
    expect(() => assertBalanced('rev', reversed)).not.toThrow()
    expect(reversed[0]?.supplierId).toBe('s1')
  })
})

// --- money + ledger invariant: the LEDGER-DESIGN §5 posting rules balance ---

describe('order_paid posting rules balance to zero (INV-1)', () => {
  it('coupon line: F=10000, platform_bp=1000 -> P=1000 -> +1000,-855,-145', () => {
    const face = agorot(10_000)
    const platformBp = bp(1000)
    const onSite = applyBp(face, platformBp) // P
    expect(onSite).toBe(1000)
    const { net, vat } = extractVat(onSite) // commission = P
    expect(net).toBe(855)
    expect(vat).toBe(145)

    const lines: JournalLine[] = [
      { kind: 'cardcom_clearing', amountAgorot: onSite }, // debit P
      { kind: 'platform_revenue', amountAgorot: -net }, // credit net
      { kind: 'vat_output', amountAgorot: -vat }, // credit vat
    ]
    expect(() => assertBalanced('order:o1:paid', lines)).not.toThrow()
  })

  it('physical line: F=10000, comm=1000 -> +10000,-9000,-855,-145', () => {
    const face = agorot(10_000)
    const platformBp = bp(1000)
    const commission = applyBp(face, platformBp)
    expect(commission).toBe(1000)
    const supplierDue = agorot(face - commission)
    expect(supplierDue).toBe(9000)
    const { net, vat } = extractVat(commission)

    const lines: JournalLine[] = [
      { kind: 'cardcom_clearing', amountAgorot: face }, // debit full charge
      { kind: 'supplier_payable', amountAgorot: -supplierDue, supplierId: 's1' },
      { kind: 'platform_revenue', amountAgorot: -net },
      { kind: 'vat_output', amountAgorot: -vat },
    ]
    expect(() => assertBalanced('order:o2:paid', lines)).not.toThrow()

    // and its reversal (refund before settlement) also balances
    expect(() => assertBalanced('reversal:j2', negateLines(lines))).not.toThrow()
  })

  it('wallet-applied coupon: D clearing (P-W) + D wallet W balances the same credits', () => {
    const face = agorot(10_000)
    const onSite = applyBp(face, bp(1000)) // 1000
    const wallet = agorot(300)
    const { net, vat } = extractVat(onSite)
    const lines: JournalLine[] = [
      { kind: 'cardcom_clearing', amountAgorot: onSite - wallet }, // 700
      { kind: 'customer_wallet', amountAgorot: wallet, userId: 'u1' }, // 300 debit (spend)
      { kind: 'platform_revenue', amountAgorot: -net },
      { kind: 'vat_output', amountAgorot: -vat },
    ]
    expect(() => assertBalanced('order:o3:paid', lines)).not.toThrow()
  })
})
