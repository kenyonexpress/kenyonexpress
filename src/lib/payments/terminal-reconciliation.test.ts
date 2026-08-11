import { describe, expect, it } from 'vitest'
import {
  type LocalPayment,
  type TerminalTransaction,
  reconcileAgainstTerminal,
  terminalAmountToAgorot,
} from './terminal-reconciliation'

function tx(id: string, agorot: number, isRefund = false): TerminalTransaction {
  return { transactionId: id, amountAgorot: agorot, occurredAt: null, isRefund }
}

function payment(overrides: Partial<LocalPayment> = {}): LocalPayment {
  return {
    paymentId: 'pay-1',
    orderId: 'order-1',
    transactionId: 'deal-1',
    amountAgorot: 10_000,
    status: 'succeeded',
    kind: 'charge',
    ...overrides,
  }
}

describe('terminalAmountToAgorot', () => {
  it('converts the decimal string a terminal reports into integer agorot', () => {
    expect(terminalAmountToAgorot('129.90')).toBe(12_990)
    expect(terminalAmountToAgorot(129.9)).toBe(12_990)
    expect(terminalAmountToAgorot('₪129.90')).toBe(12_990)
  })

  it('never returns a float, which is what makes the comparison safe', () => {
    // Comparing 12.30 to 12.299999 makes some rows differ and others not, and
    // the pattern of which is which looks like a real discrepancy.
    expect(Number.isInteger(terminalAmountToAgorot('12.30'))).toBe(true)
    expect(terminalAmountToAgorot('12.30')).toBe(1230)
  })

  it('treats an unreadable amount as zero rather than NaN', () => {
    expect(terminalAmountToAgorot(null)).toBe(0)
    expect(terminalAmountToAgorot('n/a')).toBe(0)
  })
})

describe('reconcileAgainstTerminal', () => {
  it('matches a charge both sides agree on', () => {
    const report = reconcileAgainstTerminal([tx('deal-1', 10_000)], [payment()])
    expect(report.matched).toBe(1)
    expect(report.discrepancies).toEqual([])
    expect(report.critical).toBe(0)
  })

  it('flags money the terminal took that we have no record of', () => {
    // The failure nothing else can see: the request died between the provider
    // accepting the charge and our transaction committing, so there is nothing
    // in our database to notice. The customer paid and got nothing, and no
    // support ticket will ever cite an order number, because none exists.
    const report = reconcileAgainstTerminal([tx('ghost', 25_000)], [])
    expect(report.discrepancies).toEqual([
      {
        kind: 'missing_locally',
        transactionId: 'ghost',
        terminalAgorot: 25_000,
        localAgorot: null,
        orderId: null,
        paymentId: null,
      },
    ])
    expect(report.critical).toBe(1)
  })

  it('flags an amount the two sides disagree about', () => {
    const report = reconcileAgainstTerminal(
      [tx('deal-1', 9_900)],
      [payment({ amountAgorot: 10_000 })],
    )
    expect(report.discrepancies[0]).toMatchObject({
      kind: 'amount_mismatch',
      terminalAgorot: 9_900,
      localAgorot: 10_000,
      orderId: 'order-1',
    })
    expect(report.critical).toBe(1)
  })

  it('reports a local charge the terminal did not list, at LOWER severity', () => {
    // Usually the reporting window cutting a transaction in half. Treating it
    // as critical would page somebody nightly until they stopped reading, which
    // costs the alerts that matter.
    const report = reconcileAgainstTerminal([], [payment()])
    expect(report.discrepancies[0]?.kind).toBe('missing_remotely')
    expect(report.critical).toBe(0)
  })

  it('ignores a payment that never succeeded', () => {
    // An abandoned checkout leaves `initiated` and `redirected` rows by the
    // hundred. Counting those as missing at the terminal would bury the report.
    const report = reconcileAgainstTerminal(
      [],
      [
        payment({ status: 'initiated', transactionId: 'a' }),
        payment({ status: 'redirected', transactionId: 'b' }),
        payment({ status: 'failed', transactionId: 'c' }),
      ],
    )
    expect(report.discrepancies).toEqual([])
  })

  it('ignores a succeeded payment with no transaction id, which cannot be matched', () => {
    const report = reconcileAgainstTerminal([], [payment({ transactionId: null })])
    expect(report.discrepancies).toEqual([])
  })

  it('excludes refunds from both sides rather than pairing them', () => {
    // A refund at the terminal has its own transaction id and our refund rows
    // carry theirs. Mixing the two would report every refunded order as a
    // mismatch.
    const report = reconcileAgainstTerminal(
      [tx('refund-1', 10_000, true)],
      [payment({ kind: 'refund', transactionId: 'refund-1', status: 'refunded' })],
    )
    expect(report.discrepancies).toEqual([])
    expect(report.matched).toBe(0)
  })

  it('handles a day with nothing on either side', () => {
    expect(reconcileAgainstTerminal([], [])).toEqual({
      matched: 0,
      discrepancies: [],
      critical: 0,
    })
  })

  it('counts several discrepancies of different kinds', () => {
    const report = reconcileAgainstTerminal(
      [tx('deal-1', 10_000), tx('ghost', 5_000)],
      [payment(), payment({ paymentId: 'pay-2', transactionId: 'only-ours', amountAgorot: 700 })],
    )
    expect(report.matched).toBe(1)
    expect(report.discrepancies.map((d) => d.kind).sort()).toEqual([
      'missing_locally',
      'missing_remotely',
    ])
    expect(report.critical).toBe(1)
  })
})
