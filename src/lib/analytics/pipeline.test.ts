import { mergeAttribution, readUtmFromQuery, utmForEvent } from '@/lib/analytics/attribution'
import {
  CONSENT_WORDING_VERSION,
  isTrackingAllowed,
  needsConsentDecision,
  parseConsent,
  serializeConsent,
} from '@/lib/analytics/consent'
import { hasRequiredProps, ingestBatchSchema } from '@/lib/analytics/events'
import { EventQueue } from '@/lib/analytics/queue'
import { SESSION_IDLE_MS, SESSION_STORAGE_KEY, touchSession } from '@/lib/analytics/session'
import { describe, expect, it, vi } from 'vitest'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    raw: map,
  }
}

describe('consent', () => {
  it('treats a granted decision on current wording as consent', () => {
    const cookie = serializeConsent({
      decision: 'granted',
      wordingVersion: CONSENT_WORDING_VERSION,
    })

    expect(isTrackingAllowed(cookie)).toBe(true)
    expect(needsConsentDecision(cookie)).toBe(false)
  })

  it('withholds tracking when there is no decision at all', () => {
    expect(isTrackingAllowed(undefined)).toBe(false)
    expect(needsConsentDecision(undefined)).toBe(true)
  })

  it('re-asks when the banner wording has been superseded', () => {
    const stale = serializeConsent({ decision: 'granted', wordingVersion: 0 })

    // Version 0 is below the floor, so it does not even parse as a decision.
    expect(parseConsent(stale)).toBeNull()
    expect(isTrackingAllowed(stale)).toBe(false)
    expect(needsConsentDecision(stale)).toBe(true)
  })

  it('honours a decline', () => {
    const cookie = serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION })

    expect(isTrackingAllowed(cookie)).toBe(false)
    expect(needsConsentDecision(cookie)).toBe(false)
  })

  it('ignores a malformed cookie value', () => {
    expect(parseConsent('yes')).toBeNull()
    expect(isTrackingAllowed('granted')).toBe(false)
  })
})

describe('attribution', () => {
  const now = new Date('2026-03-10T09:00:00.000Z')

  it('reads only the canonical UTM keys', () => {
    const touch = readUtmFromQuery('?utm_source=whatsapp&utm_campaign=pesach&gclid=xyz&foo=bar')

    expect(touch).toEqual({ utm_source: 'whatsapp', utm_campaign: 'pesach' })
  })

  it('returns nothing for a URL with no campaign tags', () => {
    expect(readUtmFromQuery('?page=2')).toBeNull()
  })

  it('freezes first-touch and moves last-touch', () => {
    const first = mergeAttribution(null, { utm_source: 'whatsapp' }, now)
    const second = mergeAttribution(first, { utm_source: 'newsletter' }, now)

    expect(second.first?.utm_source).toBe('whatsapp')
    expect(second.last?.utm_source).toBe('newsletter')
  })

  it('leaves both touches alone on an untagged visit', () => {
    const stored = mergeAttribution(null, { utm_source: 'whatsapp' }, now)

    expect(mergeAttribution(stored, null, now)).toEqual(stored)
  })

  it('strips the timestamp from the envelope UTM', () => {
    const stored = mergeAttribution(null, { utm_source: 'whatsapp' }, now)

    expect(utmForEvent(stored.last)).toEqual({ utm_source: 'whatsapp' })
  })
})

describe('event validation', () => {
  const validEvent = {
    event_id: '11111111-1111-4111-8111-111111111111',
    event_name: 'view_product',
    occurred_at: '2026-03-10T09:00:00.000Z',
    session_id: 'session-1',
    props: { product_id: 'p1' },
  }

  it('accepts a well-formed batch and defaults the source fields', () => {
    const parsed = ingestBatchSchema.safeParse({ events: [validEvent] })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.events[0]?.source).toBe('web')
    expect(parsed.success && parsed.data.events[0]?.source_app).toBe('shop')
  })

  it('rejects an event name outside the taxonomy', () => {
    const parsed = ingestBatchSchema.safeParse({
      events: [{ ...validEvent, event_name: 'hack_attempt' }],
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects a batch larger than the client is allowed to send', () => {
    const parsed = ingestBatchSchema.safeParse({ events: Array(21).fill(validEvent) })

    expect(parsed.success).toBe(false)
  })

  it('rejects props over the 4KB cap', () => {
    const parsed = ingestBatchSchema.safeParse({
      events: [{ ...validEvent, props: { product_id: 'p1', blob: 'x'.repeat(5000) } }],
    })

    expect(parsed.success).toBe(false)
  })

  it('mirrors the registry required-props rule', () => {
    expect(hasRequiredProps('view_product', { product_id: 'p1' })).toBe(true)
    expect(hasRequiredProps('view_product', {})).toBe(false)
    expect(hasRequiredProps('add_to_cart', { product_id: 'p1' })).toBe(false)
    expect(hasRequiredProps('add_to_cart', { product_id: 'p1', quantity: 1 })).toBe(true)
    expect(hasRequiredProps('page_view', {})).toBe(true)
  })
})

describe('session', () => {
  it('reuses a live session and extends its idle window', () => {
    const storage = memoryStorage()
    const first = touchSession(storage, 1_000_000)
    const second = touchSession(storage, 1_000_000 + 60_000)

    expect(second.id).toBe(first.id)
    expect(second.expiresAt).toBe(1_000_000 + 60_000 + SESSION_IDLE_MS)
  })

  it('starts a new session after 30 idle minutes', () => {
    const storage = memoryStorage()
    const first = touchSession(storage, 1_000_000)
    const second = touchSession(storage, 1_000_000 + SESSION_IDLE_MS + 1)

    expect(second.id).not.toBe(first.id)
  })

  it('decides Web Vitals sampling once per session, not per event', () => {
    const storage = memoryStorage()
    const sampled = touchSession(storage, 1_000_000, () => 0.1)
    // A later draw that would fail the 25% gate must not un-sample the session.
    const same = touchSession(storage, 1_000_000 + 60_000, () => 0.9)

    expect(sampled.sampleWebVitals).toBe(true)
    expect(same.sampleWebVitals).toBe(true)
  })

  it('does not sample a session drawn above the rate', () => {
    expect(touchSession(memoryStorage(), 1_000_000, () => 0.9).sampleWebVitals).toBe(false)
  })

  it('recovers from a corrupted stored session', () => {
    const storage = memoryStorage()
    storage.raw.set(SESSION_STORAGE_KEY, 'not json')

    expect(touchSession(storage, 1_000_000).id).toBeTruthy()
  })
})

describe('event queue', () => {
  it('signals a flush once the batch is full', async () => {
    const send = vi.fn().mockResolvedValue('ok' as const)
    const queue = new EventQueue<string>(send, 2)

    expect(queue.push('a')).toBe(false)
    expect(queue.push('b')).toBe(true)

    await queue.flush()
    expect(send).toHaveBeenCalledWith(['a', 'b'])
  })

  it('never sends more than one batch per flush', async () => {
    const send = vi.fn().mockResolvedValue('ok' as const)
    const queue = new EventQueue<string>(send, 2)
    queue.push('a')
    queue.push('b')
    queue.push('c')

    await queue.flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(queue.size).toBe(1)
  })

  it('retries a failed batch exactly once', async () => {
    const send = vi.fn().mockResolvedValue('failed' as const)
    const queue = new EventQueue<string>(send, 10)
    queue.push('a')

    await queue.flush()
    expect(queue.size).toBe(1)

    await queue.flush()
    // Second failure drops the event: analytics never retries into a loop.
    expect(queue.size).toBe(0)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('swallows a transport that throws', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'))
    const queue = new EventQueue<string>(send, 10)
    queue.push('a')

    await expect(queue.flush()).resolves.toBeUndefined()
  })

  it('does nothing when there is nothing queued', async () => {
    const send = vi.fn().mockResolvedValue('ok' as const)

    await new EventQueue<string>(send, 10).flush()
    expect(send).not.toHaveBeenCalled()
  })

  it('drains everything pending for the pagehide beacon', () => {
    const queue = new EventQueue<string>(vi.fn(), 10)
    queue.push('a')
    queue.push('b')

    expect(queue.drain()).toEqual(['a', 'b'])
    expect(queue.size).toBe(0)
  })
})
