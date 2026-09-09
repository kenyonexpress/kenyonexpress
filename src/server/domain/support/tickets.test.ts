import { CANNED_REPLIES, cannedReply } from '@/server/domain/support/canned-replies'
import type { TicketStatus } from '@/server/domain/support/sla'
import {
  applyMessage,
  closedAtFor,
  customerMayReply,
  operatorMayMove,
} from '@/server/domain/support/tickets'
import { describe, expect, it } from 'vitest'

const AT = new Date('2026-09-09T12:00:00Z')
const ISO = AT.toISOString()

describe('applyMessage: inbound', () => {
  it('moves an open ticket to open and stamps the customer message time', () => {
    const t = applyMessage({
      currentStatus: 'open',
      direction: 'inbound',
      hasFirstResponse: false,
      at: AT,
    })
    expect(t.status).toBe('open')
    expect(t.lastCustomerMessageAt).toBe(ISO)
    expect(t.firstResponseAt).toBeUndefined()
    expect(t.reopened).toBe(false)
  })

  it('reopens a closed ticket AND clears closed_at, because the CHECK refuses one without the other', () => {
    // 203: CHECK ((status = 'closed') = (closed_at IS NOT NULL)). Setting the
    // status without clearing the timestamp fails the constraint in front of a
    // customer trying to reply.
    const t = applyMessage({
      currentStatus: 'closed',
      direction: 'inbound',
      hasFirstResponse: true,
      at: AT,
    })
    expect(t.status).toBe('open')
    expect(t.closedAt).toBeNull()
    expect(t.reopened).toBe(true)
  })

  it('reopens a resolved ticket without touching closed_at, which was already null', () => {
    const t = applyMessage({
      currentStatus: 'resolved',
      direction: 'inbound',
      hasFirstResponse: true,
      at: AT,
    })
    expect(t.status).toBe('open')
    expect(t.closedAt).toBeUndefined()
    expect(t.reopened).toBe(true)
  })

  it('lands a reopened ticket in open rather than pending', () => {
    // `pending` means somebody has picked it up. A reopened ticket nobody has
    // looked at would be hidden from a queue filtered on untouched work.
    expect(
      applyMessage({
        currentStatus: 'waiting_customer',
        direction: 'inbound',
        hasFirstResponse: true,
        at: AT,
      }).status,
    ).toBe('open')
  })
})

describe('applyMessage: outbound', () => {
  it('stops the clock by moving to waiting_customer, and does not claim resolution', () => {
    // Marking a ticket resolved because somebody typed into it makes a
    // resolution rate meaningless.
    const t = applyMessage({
      currentStatus: 'open',
      direction: 'outbound',
      hasFirstResponse: false,
      at: AT,
    })
    expect(t.status).toBe('waiting_customer')
    expect(t.firstResponseAt).toBe(ISO)
  })

  it('does NOT move first_response_at on a later reply', () => {
    const t = applyMessage({
      currentStatus: 'open',
      direction: 'outbound',
      hasFirstResponse: true,
      at: AT,
    })
    expect(t.firstResponseAt).toBeUndefined()
  })

  it('clears closed_at when an operator answers a closed ticket', () => {
    const t = applyMessage({
      currentStatus: 'closed',
      direction: 'outbound',
      hasFirstResponse: true,
      at: AT,
    })
    expect(t.closedAt).toBeNull()
    expect(t.status).toBe('waiting_customer')
  })
})

describe('applyMessage: internal', () => {
  it('changes NOTHING, including the first-response clock', () => {
    // This is the assertion that keeps an SLA report honest: an internal note
    // that counted as an answer would let a desk hit every target without
    // saying a word to anybody.
    const t = applyMessage({
      currentStatus: 'open',
      direction: 'internal',
      hasFirstResponse: false,
      at: AT,
    })
    expect(t).toEqual({
      status: 'open',
      closedAt: undefined,
      firstResponseAt: undefined,
      lastCustomerMessageAt: undefined,
      reopened: false,
    })
  })

  it('leaves a closed ticket closed', () => {
    const t = applyMessage({
      currentStatus: 'closed',
      direction: 'internal',
      hasFirstResponse: true,
      at: AT,
    })
    expect(t.status).toBe('closed')
    expect(t.closedAt).toBeUndefined()
  })
})

describe('customerMayReply', () => {
  it('is true on every status, including closed', () => {
    const statuses: TicketStatus[] = ['open', 'pending', 'waiting_customer', 'resolved', 'closed']
    for (const status of statuses) {
      expect(customerMayReply(status), status).toBe(true)
    }
  })
})

describe('operatorMayMove', () => {
  it('lets an operator take, park, resolve or close open work', () => {
    for (const to of ['pending', 'waiting_customer', 'resolved', 'closed'] as TicketStatus[]) {
      expect(operatorMayMove('open', to), to).toBe(true)
    }
  })

  it('refuses resolved -> waiting_customer, which would claim a message nobody sent', () => {
    expect(operatorMayMove('resolved', 'waiting_customer')).toBe(false)
  })

  it('lets a closed ticket only be reopened', () => {
    expect(operatorMayMove('closed', 'open')).toBe(true)
    for (const to of ['pending', 'waiting_customer', 'resolved'] as TicketStatus[]) {
      expect(operatorMayMove('closed', to), to).toBe(false)
    }
  })

  it('refuses a move to the status it is already in', () => {
    const statuses: TicketStatus[] = ['open', 'pending', 'waiting_customer', 'resolved', 'closed']
    for (const status of statuses) {
      expect(operatorMayMove(status, status), status).toBe(false)
    }
  })
})

describe('closedAtFor', () => {
  it('sets a time for closed and null for everything else, matching the CHECK', () => {
    expect(closedAtFor('closed', AT)).toBe(ISO)
    for (const status of ['open', 'pending', 'waiting_customer', 'resolved'] as TicketStatus[]) {
      expect(closedAtFor(status, AT), status).toBeNull()
    }
  })
})

describe('canned replies', () => {
  it('has a Hebrew body and a named source for every entry', () => {
    // Each reply asserts a rule that is true in the code, and names where. That
    // is the standard content/legal/faq.ts holds itself to, for the same
    // reason: this text is read INSTEAD of the truth.
    expect(CANNED_REPLIES.length).toBeGreaterThan(5)
    for (const reply of CANNED_REPLIES) {
      expect(reply.body, reply.id).toMatch(/[֐-׿]/)
      expect(reply.body.length, reply.id).toBeGreaterThan(60)
      expect(reply.source.length, reply.id).toBeGreaterThan(5)
      expect(reply.label, reply.id).toMatch(/[֐-׿]/)
    }
  })

  it('has unique ids', () => {
    const ids = CANNED_REPLIES.map((reply) => reply.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('states the 100% rule and the fee rule as the code computes them', () => {
    // computeCancellationFee: zero on a defect claim, min(5%, ₪100) otherwise.
    expect(cannedReply('full_refund_defect')?.body).toContain('100%')
    const fee = cannedReply('cancellation_fee')?.body ?? ''
    expect(fee).toContain('5%')
    expect(fee).toContain('₪100')
  })

  it('never renders a placeholder', () => {
    for (const reply of CANNED_REPLIES) {
      expect(reply.body, reply.id).not.toMatch(/undefined|\$\{|\[שם\]/)
    }
  })

  it('returns undefined for an id that is not there', () => {
    expect(cannedReply('nope')).toBeUndefined()
  })
})
