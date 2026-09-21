import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordQueueDepth } from './queue-depth'

describe('recordQueueDepth', () => {
  let line: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    line = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function emitted(): Record<string, unknown> | undefined {
    for (const call of line.mock.calls) {
      const parsed = JSON.parse(String(call[0])) as Record<string, unknown>
      if (parsed.event === 'queue.depth') return parsed
    }
    return undefined
  }

  it('says zero out loud, because a drained queue is the measurement too', () => {
    recordQueueDepth('search_outbox', { pending: 0 })
    expect(emitted()).toMatchObject({ level: 'info', queue: 'search_outbox', pending: 0 })
  })

  it('carries stuck separately from pending when the sweep knows both', () => {
    recordQueueDepth('payment_webhook_dlq', { pending: 12, stuck: 3 })
    expect(emitted()).toMatchObject({ queue: 'payment_webhook_dlq', pending: 12, stuck: 3 })
  })

  it('omits stuck rather than charting a zero the caller never measured', () => {
    recordQueueDepth('notification_outbox', { pending: 4 })
    expect(emitted()).not.toHaveProperty('stuck')
  })

  it('stays silent on null, so "not counted" never draws as "empty"', () => {
    recordQueueDepth('search_outbox', { pending: null })
    expect(emitted()).toBeUndefined()
  })

  it('writes at info, since debug is never emitted under the default threshold', () => {
    recordQueueDepth('search_outbox', { pending: 1 })
    expect(emitted()?.level).toBe('info')
  })
})
