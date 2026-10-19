import { describe, expect, it } from 'vitest'
import { STATUTORY_WINDOW_DAYS, chooseRefundInstrument } from './refund-instrument'

const NOW = new Date('2026-09-07T12:00:00Z')

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('chooseRefundInstrument', () => {
  it('sends a redeemed voucher to the wallet however fresh the charge is', () => {
    // The order of the rules is the whole point: a charge from an hour ago is
    // well inside the window, and it still must not be pulled off the card,
    // because the meal was eaten.
    expect(
      chooseRefundInstrument({
        chargedAt: daysAgo(0),
        now: NOW,
        voucherStates: ['issued', 'redeemed'],
      }),
    ).toEqual({ instrument: 'wallet', reason: 'value_consumed' })
  })

  it('sends an expired voucher to the wallet too', () => {
    expect(
      chooseRefundInstrument({ chargedAt: daysAgo(1), now: NOW, voucherStates: ['expired'] }),
    ).toEqual({ instrument: 'wallet', reason: 'value_consumed' })
  })

  it('refunds the card inside the statutory window', () => {
    expect(chooseRefundInstrument({ chargedAt: daysAgo(3), now: NOW })).toEqual({
      instrument: 'original_method',
      reason: 'within_statutory_window',
    })
  })

  it('treats the fourteenth day as inside, not outside', () => {
    // The boundary is a legal one and it is inclusive: a customer cancelling on
    // the last day of the window is exercising the right, not asking a favour.
    expect(
      chooseRefundInstrument({ chargedAt: daysAgo(STATUTORY_WINDOW_DAYS), now: NOW }).instrument,
    ).toBe('original_method')
    expect(
      chooseRefundInstrument({ chargedAt: daysAgo(STATUTORY_WINDOW_DAYS + 0.01), now: NOW })
        .instrument,
    ).toBe('wallet')
  })

  it('credits the wallet past the window', () => {
    expect(chooseRefundInstrument({ chargedAt: daysAgo(40), now: NOW })).toEqual({
      instrument: 'wallet',
      reason: 'outside_statutory_window',
    })
  })

  it('assumes the customer is inside the window when the charge has no date', () => {
    // A missing succeeded_at is our record-keeping failing, not the customer
    // being late, so it resolves their way.
    expect(chooseRefundInstrument({ chargedAt: null, now: NOW })).toEqual({
      instrument: 'original_method',
      reason: 'charge_undated',
    })
    expect(chooseRefundInstrument({ chargedAt: new Date('nonsense'), now: NOW }).reason).toBe(
      'charge_undated',
    )
  })

  it('ignores vouchers that are still live', () => {
    expect(
      chooseRefundInstrument({
        chargedAt: daysAgo(2),
        now: NOW,
        voucherStates: ['issued', 'issued', 'cancelled'],
      }).instrument,
    ).toBe('original_method')
  })
})
