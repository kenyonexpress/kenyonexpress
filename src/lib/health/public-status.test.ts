import { describe, expect, it, vi } from 'vitest'
import {
  DEPENDENCY_COPY,
  HEALTH_COPY,
  READY_CHECK_LABELS,
  READY_COPY,
  healthStateFrom,
  probeHealth,
  probeReady,
  readyReportFixture,
  readySnapshotFrom,
} from './public-status'

function response(status: number, body: unknown, json = true): Response {
  return {
    status,
    json: json ? async () => body : async () => Promise.reject(new Error('not json')),
  } as unknown as Response
}

/**
 * UX26: the public reading of the two health routes. Held to the one
 * distinction that matters on an error page: a server that said "down" is
 * `degraded`, and a server that did not answer is `unknown`, never confused.
 */
describe('healthStateFrom', () => {
  it('reads the route’s two honest answers', () => {
    expect(healthStateFrom(200, { ok: true, database: 'ok', latency_ms: 12 })).toBe('ok')
    expect(healthStateFrom(503, { ok: false, database: 'down', latency_ms: 3000 })).toBe('degraded')
  })

  it('is unknown for anything that is not the route: a challenge page, a gateway error, a lie', () => {
    expect(healthStateFrom(403, null)).toBe('unknown')
    expect(healthStateFrom(502, '<html>')).toBe('unknown')
    expect(healthStateFrom(200, { ok: false })).toBe('unknown')
    expect(healthStateFrom(503, { ok: true })).toBe('unknown')
    expect(healthStateFrom(200, {})).toBe('unknown')
  })
})

describe('readySnapshotFrom', () => {
  it('labels the five checks in the page’s order and reads the overall state', () => {
    const snapshot = readySnapshotFrom(200, readyReportFixture())
    expect(snapshot.state).toBe('ok')
    expect(snapshot.checks.map((c) => c.name)).toEqual([
      'database',
      'redis',
      'meilisearch',
      'r2',
      'cardcom',
    ])
    expect(snapshot.checks.map((c) => c.label)).toEqual(Object.values(READY_CHECK_LABELS))
    expect(snapshot.checks.every((c) => c.status === 'ok')).toBe(true)
  })

  it('a down service is degraded, a not_configured one is not', () => {
    const degraded = readySnapshotFrom(503, readyReportFixture({ meilisearch: 'down' }))
    expect(degraded.state).toBe('degraded')
    expect(degraded.checks.find((c) => c.name === 'meilisearch')?.status).toBe('down')

    const partial = readyReportFixture({ r2: 'not_configured' })
    expect(partial.ok).toBe(true)
    expect(readySnapshotFrom(200, partial).state).toBe('ok')
  })

  it('a check the body does not carry, or carries with a foreign value, renders as down', () => {
    const body = { ok: true, checks: { database: 'ok', redis: 'fine' } }
    const snapshot = readySnapshotFrom(200, body)
    expect(snapshot.checks.find((c) => c.name === 'redis')?.status).toBe('down')
    expect(snapshot.checks.find((c) => c.name === 'cardcom')?.status).toBe('down')
  })

  it('is unknown with no checks for a body that is not the report', () => {
    expect(readySnapshotFrom(200, null)).toEqual({ state: 'unknown', checks: [] })
    expect(readySnapshotFrom(502, { error: 'bad gateway' })).toEqual({
      state: 'unknown',
      checks: [],
    })
  })
})

describe('probeHealth / probeReady', () => {
  it('ask the route with no-store and never throw', async () => {
    const fetchImpl = vi.fn(async () => response(200, { ok: true }))
    await expect(probeHealth(fetchImpl as unknown as typeof fetch)).resolves.toBe('ok')
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ cache: 'no-store' }),
    )

    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(probeHealth(failing as unknown as typeof fetch)).resolves.toBe('unknown')
    await expect(probeReady(failing as unknown as typeof fetch)).resolves.toEqual({
      state: 'unknown',
      checks: [],
    })
  })

  it('a body that is not JSON is unknown', async () => {
    const fetchImpl = vi.fn(async () => response(200, null, false))
    await expect(probeHealth(fetchImpl as unknown as typeof fetch)).resolves.toBe('unknown')
  })

  it('probeReady reads the report', async () => {
    const fetchImpl = vi.fn(async () => response(503, readyReportFixture({ database: 'down' })))
    const snapshot = await probeReady(fetchImpl as unknown as typeof fetch)
    expect(snapshot.state).toBe('degraded')
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/ready',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })
})

describe('copy', () => {
  it('every state has a Hebrew sentence, and unknown does not claim an outage', () => {
    for (const copy of [HEALTH_COPY, READY_COPY]) {
      for (const state of ['checking', 'ok', 'degraded', 'unknown'] as const) {
        expect(copy[state]).toMatch(/[֐-׿]/)
      }
      expect(copy.unknown).not.toContain('תקלה כללית')
    }
    expect(Object.keys(DEPENDENCY_COPY)).toEqual(['ok', 'down', 'not_configured'])
  })
})
