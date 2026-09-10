import {
  type TimelineEvent,
  buildCustomerTimeline,
  timelineCounts,
} from '@/lib/admin/customer-timeline'
import { describe, expect, it } from 'vitest'

function event(
  kind: TimelineEvent['kind'],
  id: string,
  at: string,
  extra: Partial<TimelineEvent> = {},
): TimelineEvent {
  return { kind, id, at, titleHe: `${kind} ${id}`, ...extra }
}

describe('buildCustomerTimeline', () => {
  it('merges every source into one list, newest first', () => {
    const events = buildCustomerTimeline({
      orders: [event('order', 'o1', '2026-01-01T10:00:00Z')],
      wallet: [event('wallet', 'w1', '2026-03-01T10:00:00Z')],
      refunds: [event('refund', 'r1', '2026-02-01T10:00:00Z')],
    })

    expect(events.map((e) => e.id)).toEqual(['w1', 'r1', 'o1'])
  })

  it('caps AFTER the merge, never per source', () => {
    // The bug this guards: cap each source at N, then merge, and a busy source
    // loses recent rows to a quiet source's ancient ones. Here `orders` holds
    // the three newest events; a per-source cap would have kept the wallet row.
    const events = buildCustomerTimeline(
      {
        orders: [
          event('order', 'o3', '2026-05-03T00:00:00Z'),
          event('order', 'o2', '2026-05-02T00:00:00Z'),
          event('order', 'o1', '2026-05-01T00:00:00Z'),
        ],
        wallet: [event('wallet', 'w1', '2020-01-01T00:00:00Z')],
      },
      3,
    )

    expect(events.map((e) => e.id)).toEqual(['o3', 'o2', 'o1'])
  })

  it('breaks a tie by cause before effect, not by source order', () => {
    // A wallet credit and the mail announcing it are routinely written in the
    // same millisecond. Spread order must not decide which reads first.
    const at = '2026-04-01T12:00:00.000Z'
    const events = buildCustomerTimeline({
      emails: [event('email', 'e1', at)],
      wallet: [event('wallet', 'w1', at)],
      refunds: [event('refund', 'r1', at)],
      orders: [event('order', 'o1', at)],
    })

    expect(events.map((e) => e.kind)).toEqual(['order', 'refund', 'wallet', 'email'])
  })

  it('is stable for two events of one kind at one instant', () => {
    const at = '2026-04-01T12:00:00.000Z'
    const forward = buildCustomerTimeline({
      orders: [event('order', 'aaa', at), event('order', 'bbb', at)],
    })
    const reversed = buildCustomerTimeline({
      orders: [event('order', 'bbb', at), event('order', 'aaa', at)],
    })

    expect(forward.map((e) => e.id)).toEqual(['aaa', 'bbb'])
    expect(reversed.map((e) => e.id)).toEqual(forward.map((e) => e.id))
  })

  it('sinks an unparseable timestamp rather than dropping the row', () => {
    // The row is about a real customer. Dropping it makes the page claim a
    // thing did not happen; sorting it last keeps it visible and harmless.
    const events = buildCustomerTimeline({
      orders: [event('order', 'good', '2026-01-01T00:00:00Z')],
      wallet: [event('wallet', 'broken', 'not a date')],
    })

    expect(events).toHaveLength(2)
    expect(events[1]?.id).toBe('broken')
  })

  it('returns an empty list for no sources and for a zero cap', () => {
    expect(buildCustomerTimeline({})).toEqual([])
    expect(
      buildCustomerTimeline({ orders: [event('order', 'o1', '2026-01-01T00:00:00Z')] }, 0),
    ).toEqual([])
  })
})

describe('timelineCounts', () => {
  it('counts each kind and reports zero for the absent ones', () => {
    const counts = timelineCounts([
      event('order', 'o1', '2026-01-01T00:00:00Z'),
      event('order', 'o2', '2026-01-02T00:00:00Z'),
      event('email', 'e1', '2026-01-03T00:00:00Z'),
    ])

    expect(counts).toEqual({
      order: 2,
      email: 1,
      voucher: 0,
      refund: 0,
      wallet: 0,
      notification: 0,
    })
  })
})
