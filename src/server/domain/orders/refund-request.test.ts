import {
  REFUND_REQUEST_CAP,
  REFUND_REQUEST_WINDOW_DAYS,
  type RefundRequestRow,
  decideRefundRequest,
} from '@/server/domain/orders/refund-request'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-09-09T12:00:00Z')
const PAID = new Date('2026-09-01T12:00:00Z').toISOString()

const rows = (...statuses: RefundRequestRow['status'][]): RefundRequestRow[] =>
  statuses.map((status) => ({ status }))

describe('decideRefundRequest', () => {
  it('lets a paid order with no prior requests through, with three left', () => {
    expect(
      decideRefundRequest({ orderStatus: 'paid', paidAt: PAID, existing: [], now: NOW }),
    ).toEqual({ allowed: true, remaining: REFUND_REQUEST_CAP })
  })

  it('refuses an order that was never paid', () => {
    const result = decideRefundRequest({
      orderStatus: 'pending',
      paidAt: null,
      existing: [],
      now: NOW,
    })
    expect(result.allowed === false && result.reason).toBe('ORDER_NOT_PAID')
  })

  it('refuses an order that is already refunded, and says so specifically', () => {
    const result = decideRefundRequest({
      orderStatus: 'refunded',
      paidAt: PAID,
      existing: [],
      now: NOW,
    })
    // Not ORDER_NOT_PAID: telling somebody their refunded order "was not paid"
    // is the message that generates the support ticket.
    expect(result.allowed === false && result.reason).toBe('ALREADY_REFUNDED')
  })

  it('allows a second and third ask after a rejection', () => {
    const second = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: PAID,
      existing: rows('rejected'),
      now: NOW,
    })
    expect(second).toEqual({ allowed: true, remaining: 2 })
    const third = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: PAID,
      existing: rows('rejected', 'rejected'),
      now: NOW,
    })
    expect(third).toEqual({ allowed: true, remaining: 1 })
  })

  it('refuses the FOURTH ask', () => {
    const result = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: PAID,
      existing: rows('rejected', 'rejected', 'rejected'),
      now: NOW,
    })
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.reason).toBe('CAP_REACHED')
    expect(result.remaining).toBe(0)
  })

  it('COUNTS WITHDRAWN REQUESTS, because otherwise the cap is free to bypass', () => {
    // Open, withdraw, reopen. If a withdrawal freed a slot the limit would be
    // decorative for anyone who noticed, and withdrawing costs nothing.
    const result = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: PAID,
      existing: rows('withdrawn', 'withdrawn', 'withdrawn'),
      now: NOW,
    })
    expect(result.allowed === false && result.reason).toBe('CAP_REACHED')
  })

  it('counts an approved request too', () => {
    const result = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: PAID,
      existing: rows('approved', 'rejected', 'withdrawn'),
      now: NOW,
    })
    expect(result.allowed === false && result.reason).toBe('CAP_REACHED')
  })

  it('reports a pending request BEFORE the cap, because it is the useful sentence', () => {
    const result = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: PAID,
      existing: rows('pending'),
      now: NOW,
    })
    expect(result.allowed === false && result.reason).toBe('ALREADY_PENDING')
  })

  it('prefers ALREADY_PENDING over CAP_REACHED when both are true', () => {
    const result = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: PAID,
      existing: rows('rejected', 'rejected', 'pending'),
      now: NOW,
    })
    expect(result.allowed === false && result.reason).toBe('ALREADY_PENDING')
  })

  it('closes the form after the window, on the far side of the boundary', () => {
    const old = new Date(NOW.getTime() - (REFUND_REQUEST_WINDOW_DAYS + 1) * 86_400_000)
    const closed = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: old.toISOString(),
      existing: [],
      now: NOW,
    })
    expect(closed.allowed === false && closed.reason).toBe('WINDOW_CLOSED')

    const justInside = new Date(NOW.getTime() - (REFUND_REQUEST_WINDOW_DAYS - 1) * 86_400_000)
    expect(
      decideRefundRequest({
        orderStatus: 'paid',
        paidAt: justInside.toISOString(),
        existing: [],
        now: NOW,
      }).allowed,
    ).toBe(true)
  })

  it('does not let a broken timestamp cost the customer their right to ask', () => {
    expect(
      decideRefundRequest({
        orderStatus: 'paid',
        paidAt: 'not a date',
        existing: [],
        now: NOW,
      }).allowed,
    ).toBe(true)
    expect(
      decideRefundRequest({ orderStatus: 'paid', paidAt: null, existing: [], now: NOW }).allowed,
    ).toBe(true)
  })

  it('every refusal carries a Hebrew sentence with nothing unrendered in it', () => {
    const cases = [
      { orderStatus: 'pending', paidAt: null, existing: [] },
      { orderStatus: 'refunded', paidAt: PAID, existing: [] },
      { orderStatus: 'paid', paidAt: PAID, existing: rows('pending') },
      { orderStatus: 'paid', paidAt: PAID, existing: rows('rejected', 'rejected', 'rejected') },
      { orderStatus: 'paid', paidAt: '2020-01-01T00:00:00Z', existing: [] },
    ]
    for (const input of cases) {
      const result = decideRefundRequest({ ...input, now: NOW })
      expect(result.allowed).toBe(false)
      if (result.allowed === false) {
        expect(result.message).toMatch(/[֐-׿]/)
        expect(result.message).not.toMatch(/undefined|NaN|\$\{/)
      }
    }
  })

  it('never reports a negative remaining, even past the cap', () => {
    const result = decideRefundRequest({
      orderStatus: 'paid',
      paidAt: PAID,
      existing: rows('rejected', 'rejected', 'rejected', 'rejected', 'rejected'),
      now: NOW,
    })
    expect(result.remaining).toBe(0)
  })
})
