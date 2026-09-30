import { describe, expect, it } from 'vitest'
import {
  SERVICE_WINDOW_MS,
  lastInboundAt,
  serviceWindowOpen,
  windowOpenSince,
} from './service-window'

const NOW = Date.parse('2026-10-01T12:00:00Z')

function adminWith(result: { data: unknown; error: unknown } | 'throws') {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain
  chain.maybeSingle = async () => {
    if (result === 'throws') throw new Error('boom')
    return result
  }
  return { from: () => chain } as never
}

describe('windowOpenSince', () => {
  it('is open strictly inside 24 hours of the last inbound message', () => {
    expect(windowOpenSince(new Date(NOW - 1000).toISOString(), NOW)).toBe(true)
    expect(windowOpenSince(new Date(NOW - SERVICE_WINDOW_MS + 1).toISOString(), NOW)).toBe(true)
    expect(windowOpenSince(new Date(NOW - SERVICE_WINDOW_MS).toISOString(), NOW)).toBe(false)
    expect(windowOpenSince(new Date(NOW - 2 * SERVICE_WINDOW_MS).toISOString(), NOW)).toBe(false)
  })

  it('is closed for nothing, garbage, and a timestamp from the future', () => {
    expect(windowOpenSince(null, NOW)).toBe(false)
    expect(windowOpenSince(undefined, NOW)).toBe(false)
    expect(windowOpenSince('not a date', NOW)).toBe(false)
    expect(windowOpenSince(new Date(NOW + 60_000).toISOString(), NOW)).toBe(false)
  })
})

describe('lastInboundAt and serviceWindowOpen', () => {
  it('reads the newest inbound row for the phone', async () => {
    const admin = adminWith({ data: { created_at: '2026-10-01T11:30:00Z' }, error: null })
    expect(await lastInboundAt(admin, '972501234567')).toBe('2026-10-01T11:30:00Z')
    expect(await serviceWindowOpen(admin, '972501234567', NOW)).toBe(true)
  })

  it('reads closed when there is no row, on a read error, and when the client throws', async () => {
    expect(await serviceWindowOpen(adminWith({ data: null, error: null }), 'p', NOW)).toBe(false)
    expect(
      await serviceWindowOpen(
        adminWith({ data: null, error: { message: 'relation missing' } }),
        'p',
        NOW,
      ),
    ).toBe(false)
    expect(await serviceWindowOpen(adminWith('throws'), 'p', NOW)).toBe(false)
  })
})
