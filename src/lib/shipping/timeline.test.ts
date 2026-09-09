import { describe, expect, it } from 'vitest'
import { type TimelineInput, type TimelineLine, buildOrderTimeline } from './timeline'

const CREATED = '2026-09-01T08:00:00.000Z'
const PAID = '2026-09-01T08:02:00.000Z'

function line(over: Partial<TimelineLine> = {}): TimelineLine {
  return {
    itemStatus: 'pending',
    productType: 'physical',
    shippedAt: null,
    deliveredAt: null,
    ...over,
  }
}

function input(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    orderCreatedAt: CREATED,
    orderPaidAt: PAID,
    orderStatus: 'paid',
    lines: [line()],
    ...over,
  }
}

function stateOf(timeline: ReturnType<typeof buildOrderTimeline>, id: string) {
  return timeline.steps.find((s) => s.id === id)?.state
}

describe('buildOrderTimeline', () => {
  it('always reports five steps in order', () => {
    const timeline = buildOrderTimeline(input())
    expect(timeline.steps.map((s) => s.id)).toEqual([
      'placed',
      'confirmed',
      'packed',
      'shipped',
      'delivered',
    ])
    expect(timeline.steps.every((s) => s.labelHe.length > 0)).toBe(true)
  })

  it('stops at placed while the order is unpaid', () => {
    const timeline = buildOrderTimeline(input({ orderPaidAt: null, orderStatus: 'pending' }))
    expect(timeline.currentStep).toBe('placed')
    expect(stateOf(timeline, 'confirmed')).toBe('upcoming')
    expect(timeline.steps.find((s) => s.id === 'confirmed')?.at).toBeNull()
  })

  it('sits on packed once paid and nothing has shipped, with no invented time', () => {
    const timeline = buildOrderTimeline(input())
    expect(timeline.currentStep).toBe('packed')
    const packed = timeline.steps.find((s) => s.id === 'packed')
    expect(packed?.at).toBeNull()
    expect(packed?.detailHe).toBeTruthy()
    expect(stateOf(timeline, 'confirmed')).toBe('done')
    expect(timeline.steps.find((s) => s.id === 'confirmed')?.at).toBe(PAID)
  })

  it('marks packed done, undated, once the line has shipped', () => {
    const timeline = buildOrderTimeline(
      input({ lines: [line({ itemStatus: 'shipped', shippedAt: '2026-09-03T10:00:00.000Z' })] }),
    )
    expect(stateOf(timeline, 'packed')).toBe('done')
    expect(timeline.steps.find((s) => s.id === 'packed')?.at).toBeNull()
    expect(timeline.currentStep).toBe('shipped')
  })

  it('is delivered, and terminal rather than waiting', () => {
    const timeline = buildOrderTimeline(
      input({
        lines: [
          line({
            itemStatus: 'delivered',
            shippedAt: '2026-09-03T10:00:00.000Z',
            deliveredAt: '2026-09-05T10:00:00.000Z',
          }),
        ],
      }),
    )
    expect(timeline.currentStep).toBe('delivered')
    expect(stateOf(timeline, 'delivered')).toBe('done')
    expect(timeline.steps.find((s) => s.id === 'delivered')?.at).toBe('2026-09-05T10:00:00.000Z')
  })

  it('takes the least advanced live line, because that is what is still awaited', () => {
    const timeline = buildOrderTimeline(
      input({
        lines: [
          line({ itemStatus: 'delivered', deliveredAt: '2026-09-05T10:00:00.000Z' }),
          line({ itemStatus: 'shipped', shippedAt: '2026-09-04T10:00:00.000Z' }),
          line({ itemStatus: 'pending' }),
        ],
      }),
    )
    expect(timeline.currentStep).toBe('packed')
    expect(stateOf(timeline, 'shipped')).toBe('upcoming')
  })

  it('does not let a refunded line peg a delivered order', () => {
    const timeline = buildOrderTimeline(
      input({
        lines: [
          line({ itemStatus: 'delivered', deliveredAt: '2026-09-05T10:00:00.000Z' }),
          line({ itemStatus: 'refunded' }),
        ],
      }),
    )
    expect(timeline.currentStep).toBe('delivered')
  })

  it('stamps shipped with the LAST line to leave, not the first', () => {
    const timeline = buildOrderTimeline(
      input({
        lines: [
          line({ itemStatus: 'shipped', shippedAt: '2026-09-03T10:00:00.000Z' }),
          line({ itemStatus: 'shipped', shippedAt: '2026-09-06T10:00:00.000Z' }),
        ],
      }),
    )
    expect(timeline.steps.find((s) => s.id === 'shipped')?.at).toBe('2026-09-06T10:00:00.000Z')
  })

  it('still reports shipped when the row carries the status but no stamp', () => {
    const timeline = buildOrderTimeline(
      input({ lines: [line({ itemStatus: 'shipped', shippedAt: null })] }),
    )
    expect(timeline.currentStep).toBe('shipped')
    expect(timeline.steps.find((s) => s.id === 'shipped')?.at).toBeNull()
  })

  it('reports a coupon-only order as having nothing to track', () => {
    const timeline = buildOrderTimeline(
      input({ lines: [line({ productType: 'coupon', itemStatus: 'issued' })] }),
    )
    expect(timeline.physicalLines).toBe(0)
    expect(timeline.currentStep).toBe('confirmed')
  })

  it('never dates a step the order has not reached', () => {
    const timeline = buildOrderTimeline(input())
    for (const step of timeline.steps) {
      if (step.state === 'upcoming') expect(step.at).toBeNull()
    }
  })
})
