import { afterEach, describe, expect, it } from 'vitest'
import {
  deadLetterWebhookRetry,
  enqueueWebhookRetry,
  isRetryQueuePersistent,
  popWebhookRetry,
  resetInMemoryQueues,
  retryQueueDepth,
} from './webhook-retry'

// Without UPSTASH_* env the module runs on its in-memory queue; that is the
// path under test here. The Upstash path shares every call site above the
// push/pop seam.

afterEach(() => resetInMemoryQueues())

describe('webhook retry queue (in-memory fallback)', () => {
  it('reports non-persistent mode without Upstash env', () => {
    expect(isRetryQueuePersistent()).toBe(false)
  })

  it('is FIFO across enqueue/pop and drains to null', async () => {
    await enqueueWebhookRetry({
      provider: 'cardcom',
      lowProfileId: 'lp-1',
      externalEventId: 'lp-1:na',
      attempt: 1,
    })
    await enqueueWebhookRetry({
      provider: 'cardcom',
      lowProfileId: 'lp-2',
      externalEventId: 'lp-2:na',
      attempt: 1,
    })

    const first = await popWebhookRetry()
    const second = await popWebhookRetry()
    expect(first?.lowProfileId).toBe('lp-1')
    expect(first?.enqueuedAt).toBeTruthy()
    expect(second?.lowProfileId).toBe('lp-2')
    expect(await popWebhookRetry()).toBeNull()
  })

  it('tracks pending and dead depths separately', async () => {
    await enqueueWebhookRetry({
      provider: 'cardcom',
      lowProfileId: 'lp-3',
      externalEventId: 'lp-3:na',
      attempt: 4,
    })
    const job = await popWebhookRetry()
    expect(job).not.toBeNull()
    if (job) await deadLetterWebhookRetry(job)

    const depth = await retryQueueDepth()
    expect(depth.pending).toBe(0)
    expect(depth.dead).toBe(1)
  })
})
