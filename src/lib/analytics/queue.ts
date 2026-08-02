import { MAX_BATCH_SIZE } from '@/lib/analytics/events'

// Transport-agnostic batching queue. Kept free of browser globals so the
// batching, flush and retry rules are unit-testable; the DOM wiring (timers,
// pagehide, sendBeacon) lives in tracker.ts.

export const FLUSH_INTERVAL_MS = 10_000

export type QueueItem<T> = {
  event: T
  /** An event is retried exactly once. Analytics never blocks or spams. */
  attempts: number
}

export type SendResult = 'ok' | 'failed'

export type Sender<T> = (events: T[]) => Promise<SendResult>

export class EventQueue<T> {
  private items: QueueItem<T>[] = []
  private inFlight = false

  constructor(
    private readonly send: Sender<T>,
    private readonly maxBatch: number = MAX_BATCH_SIZE,
  ) {}

  get size(): number {
    return this.items.length
  }

  /** Returns true when the queue is full enough that the caller should flush. */
  push(event: T): boolean {
    this.items.push({ event, attempts: 0 })
    return this.items.length >= this.maxBatch
  }

  /**
   * Sends one batch. Concurrent calls are collapsed: a flush already in flight
   * wins, and whatever arrived meanwhile goes out on the next one. Failures
   * re-queue at the front, once, so ordering stays roughly chronological.
   */
  async flush(): Promise<void> {
    if (this.inFlight || this.items.length === 0) return
    this.inFlight = true

    const batch = this.items.splice(0, this.maxBatch)
    try {
      const result = await this.send(batch.map((item) => item.event))
      if (result === 'failed') {
        const retriable = batch
          .filter((item) => item.attempts === 0)
          .map((item) => ({ ...item, attempts: item.attempts + 1 }))
        this.items.unshift(...retriable)
      }
    } catch {
      // A transport that throws is a failure like any other: never surface it.
    } finally {
      this.inFlight = false
    }
  }

  /** Everything pending, for a synchronous last-gasp send on pagehide. */
  drain(): T[] {
    const events = this.items.map((item) => item.event)
    this.items = []
    return events
  }
}
