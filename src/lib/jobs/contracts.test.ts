import { describe, expect, it } from 'vitest'
import { JOB_TYPES, MAX_REPLAYS, jobEnvelopeSchema, newJobEnvelope, parseJob } from './contracts'

const PRODUCT_ID = '3e9a4f6c-1b2d-4c5e-8f7a-9b0c1d2e3f4a'

describe('newJobEnvelope', () => {
  it('stamps version, a uuid id, the time and a zero replay count', () => {
    const now = new Date('2026-09-17T10:00:00.000Z')
    const envelope = newJobEnvelope('cache-warm', { paths: ['/'] }, now)
    expect(envelope.v).toBe(1)
    expect(envelope.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(envelope.enqueuedAt).toBe('2026-09-17T10:00:00.000Z')
    expect(envelope.replayCount).toBe(0)
    expect(envelope.replayOf).toBeUndefined()
    expect(jobEnvelopeSchema.safeParse(envelope).success).toBe(true)
  })

  it('mints a different id every time, so two producers never collapse in QStash dedup', () => {
    const a = newJobEnvelope('cache-warm', { paths: ['/'] })
    const b = newJobEnvelope('cache-warm', { paths: ['/'] })
    expect(a.id).not.toBe(b.id)
  })
})

describe('parseJob', () => {
  it('accepts every registered type with a valid payload', () => {
    const cases = {
      'search-index': {
        op: 'upsert',
        productId: PRODUCT_ID,
        reason: 'test',
        enqueuedAt: '2026-09-17T10:00:00.000Z',
      },
      'search-outbox-drain': {},
      'cache-warm': { paths: ['/', '/products'] },
    } as const
    for (const type of JOB_TYPES) {
      const result = parseJob(newJobEnvelope(type, cases[type] as never))
      expect(result.ok, type).toBe(true)
    }
  })

  it('names the envelope when the envelope is wrong', () => {
    expect(parseJob({ type: 'cache-warm', payload: { paths: ['/'] } })).toEqual({
      ok: false,
      reason: 'unrecognized envelope',
    })
    expect(parseJob({ ...newJobEnvelope('cache-warm', { paths: ['/'] }), v: 2 })).toEqual({
      ok: false,
      reason: 'unrecognized envelope',
    })
    expect(parseJob({ ...newJobEnvelope('cache-warm', { paths: ['/'] }), type: 'nope' })).toEqual({
      ok: false,
      reason: 'unrecognized envelope',
    })
  })

  it('names the type when the payload is wrong for it', () => {
    const envelope = { ...newJobEnvelope('cache-warm', { paths: ['/'] }), payload: { paths: [] } }
    expect(parseJob(envelope)).toEqual({ ok: false, reason: 'invalid payload for cache-warm' })
  })

  it('refuses a cache-warm path that is a full URL or carries a query', () => {
    for (const bad of ['https://evil.example/', '/search?q=x', 'products', '/a b']) {
      const envelope = {
        ...newJobEnvelope('cache-warm', { paths: ['/'] }),
        payload: { paths: [bad] },
      }
      expect(parseJob(envelope).ok, bad).toBe(false)
    }
  })

  it('bounds a cache-warm job to fifty paths', () => {
    const paths = Array.from({ length: 51 }, (_, i) => `/p${i}`)
    const envelope = { ...newJobEnvelope('cache-warm', { paths: ['/'] }), payload: { paths } }
    expect(parseJob(envelope).ok).toBe(false)
  })

  it('carries replay bookkeeping through', () => {
    const envelope = {
      ...newJobEnvelope('search-outbox-drain', {}),
      replayCount: 2,
      replayOf: '3e9a4f6c-1b2d-4c5e-8f7a-9b0c1d2e3f4a',
    }
    const result = parseJob(envelope)
    expect(result.ok && result.envelope.replayCount).toBe(2)
    expect(MAX_REPLAYS).toBe(3)
  })
})
