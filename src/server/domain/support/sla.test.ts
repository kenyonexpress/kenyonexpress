import {
  PRIORITY_LABELS,
  SLA_TARGETS,
  STATUS_LABELS,
  type TicketPriority,
  slaState,
  suggestedPriority,
} from '@/server/domain/support/sla'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-09-09T12:00:00Z')
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString()

describe('slaState', () => {
  it('counts down to the first response on a fresh ticket', () => {
    const state = slaState({
      createdAt: hoursAgo(1),
      firstResponseAt: null,
      status: 'open',
      priority: 'normal',
      now: NOW,
    })
    expect(state.firstResponseBreached).toBe(false)
    expect(state.minutesToFirstResponse).toBe((SLA_TARGETS.normal.firstResponseHours - 1) * 60)
  })

  it('breaches once the first-response target has passed with no answer', () => {
    const state = slaState({
      createdAt: hoursAgo(SLA_TARGETS.urgent.firstResponseHours + 1),
      firstResponseAt: null,
      status: 'open',
      priority: 'urgent',
      now: NOW,
    })
    expect(state.firstResponseBreached).toBe(true)
    expect(state.breached).toBe(true)
    // Negative minutes are how the console renders "overdue by".
    expect(state.minutesToFirstResponse).toBeLessThan(0)
  })

  it('keeps a late first response recorded as a breach afterwards', () => {
    // A ticket answered late is a breach in the record for ever. If replying
    // cleared it, the metric would measure only what is currently unanswered.
    const state = slaState({
      createdAt: hoursAgo(48),
      firstResponseAt: hoursAgo(20),
      status: 'resolved',
      priority: 'normal',
      now: NOW,
    })
    expect(state.firstResponseBreached).toBe(true)
  })

  it('does not breach when the response landed inside the target', () => {
    const state = slaState({
      createdAt: hoursAgo(48),
      firstResponseAt: hoursAgo(47),
      status: 'closed',
      priority: 'normal',
      now: NOW,
    })
    expect(state.firstResponseBreached).toBe(false)
    expect(state.breached).toBe(false)
  })

  it('STOPS THE CLOCK on waiting_customer, which is why that status exists', () => {
    // Counting the hours a customer takes to answer as our breach makes the
    // number measure the customer, and the predictable response to a metric
    // like that is to stop asking clarifying questions.
    const state = slaState({
      createdAt: hoursAgo(1000),
      firstResponseAt: null,
      status: 'waiting_customer',
      priority: 'urgent',
      now: NOW,
    })
    expect(state.paused).toBe(true)
    expect(state.firstResponseBreached).toBe(false)
    expect(state.resolutionBreached).toBe(false)
    expect(state.minutesToFirstResponse).toBeNull()
  })

  it('never reports a resolution breach on a finished ticket', () => {
    for (const status of ['resolved', 'closed'] as const) {
      const state = slaState({
        createdAt: hoursAgo(1000),
        firstResponseAt: hoursAgo(999),
        status,
        priority: 'urgent',
        now: NOW,
      })
      expect(state.resolutionBreached, status).toBe(false)
    }
  })

  it('breaches on resolution while the ticket is still open, even after a reply', () => {
    const state = slaState({
      createdAt: hoursAgo(SLA_TARGETS.high.resolutionHours + 1),
      firstResponseAt: hoursAgo(SLA_TARGETS.high.resolutionHours),
      status: 'pending',
      priority: 'high',
      now: NOW,
    })
    expect(state.firstResponseBreached).toBe(false)
    expect(state.resolutionBreached).toBe(true)
    expect(state.breached).toBe(true)
  })

  it('falls back to the normal target rather than throwing on an unknown priority', () => {
    // Old rows survive a re-tuning of the table, and the queue must render them.
    const state = slaState({
      createdAt: hoursAgo(1),
      firstResponseAt: null,
      status: 'open',
      priority: 'legendary' as TicketPriority,
      now: NOW,
    })
    expect(state.minutesToFirstResponse).toBe((SLA_TARGETS.normal.firstResponseHours - 1) * 60)
  })

  it('does not treat an unparseable created_at as an instant breach', () => {
    const state = slaState({
      createdAt: 'not a date',
      firstResponseAt: null,
      status: 'open',
      priority: 'urgent',
      now: NOW,
    })
    expect(state.firstResponseBreached).toBe(false)
  })

  it('orders the targets so a more urgent ticket is never given more time', () => {
    const order: TicketPriority[] = ['urgent', 'high', 'normal', 'low']
    for (let i = 1; i < order.length; i++) {
      const tighter = SLA_TARGETS[order[i - 1] as TicketPriority]
      const looser = SLA_TARGETS[order[i] as TicketPriority]
      expect(tighter.firstResponseHours).toBeLessThanOrEqual(looser.firstResponseHours)
      expect(tighter.resolutionHours).toBeLessThanOrEqual(looser.resolutionHours)
    }
  })

  it('gives every target a resolution window at least as long as its response window', () => {
    for (const [name, target] of Object.entries(SLA_TARGETS)) {
      expect(target.resolutionHours, name).toBeGreaterThanOrEqual(target.firstResponseHours)
      expect(target.reason.length, name).toBeGreaterThan(20)
    }
  })
})

describe('suggestedPriority', () => {
  it('treats a voucher that will not scan as urgent', () => {
    // Somebody is standing at a counter right now.
    expect(suggestedPriority({ channel: 'order_help', category: 'voucher_problem' })).toBe('urgent')
  })

  it('treats money questions as high', () => {
    expect(suggestedPriority({ channel: 'order_help', category: 'payment' })).toBe('high')
    expect(suggestedPriority({ channel: 'order_help', category: 'refund' })).toBe('high')
    expect(suggestedPriority({ channel: 'return_request', category: null })).toBe('high')
  })

  it('treats supplier interest as low and everything else as normal', () => {
    expect(suggestedPriority({ channel: 'contact_form', category: 'supplier' })).toBe('low')
    expect(suggestedPriority({ channel: 'contact_form', category: 'other' })).toBe('normal')
    expect(suggestedPriority({ channel: 'whatsapp', category: null })).toBe('normal')
  })

  it('reads structure only, never the customer wording', () => {
    // There is no classifier here on purpose: one that guessed "urgent" from an
    // exclamation mark would be trained by customers within a week. Same
    // channel and category in, same answer out, whatever was typed.
    expect(suggestedPriority({ channel: 'contact_form', category: 'other' })).toBe(
      suggestedPriority({ channel: 'contact_form', category: 'other' }),
    )
  })
})

describe('labels', () => {
  it('has Hebrew for every status and priority', () => {
    for (const label of [...Object.values(STATUS_LABELS), ...Object.values(PRIORITY_LABELS)]) {
      expect(label).toMatch(/[֐-׿]/)
    }
  })
})
