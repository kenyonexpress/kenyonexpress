import { describe, expect, it } from 'vitest'
import { SNOOZE_DAYS, isSnoozed, readSnooze, snoozeEndsAt, writeSnooze } from './snooze'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0)

function memoryStore() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    map,
  }
}

describe('a dismissed nudge stays away for thirty days', () => {
  it('the window is thirty days, measured from the dismissal', () => {
    expect(SNOOZE_DAYS).toBe(30)
    expect(snoozeEndsAt(NOW)).toBe(NOW + 30 * DAY)
  })

  it('is in force the whole window and lapses the instant it ends', () => {
    const until = String(snoozeEndsAt(NOW))
    expect(isSnoozed(until, NOW)).toBe(true)
    expect(isSnoozed(until, NOW + 29 * DAY)).toBe(true)
    expect(isSnoozed(until, NOW + 30 * DAY - 1)).toBe(true)
    expect(isSnoozed(until, NOW + 30 * DAY)).toBe(false)
    expect(isSnoozed(until, NOW + 31 * DAY)).toBe(false)
  })

  it.each([null, undefined, '', '1', 'true', '-5', '1.5', 'NaN', 'yesterday'])(
    'treats %j as not snoozed, so the legacy permanent flag asks once more',
    (stored) => {
      expect(isSnoozed(stored, NOW)).toBe(false)
    },
  )

  it('round-trips through a storage object', () => {
    const store = memoryStore()
    expect(readSnooze('ke:x', NOW, store)).toBe(false)
    writeSnooze('ke:x', NOW, store)
    expect(store.map.get('ke:x')).toBe(String(NOW + 30 * DAY))
    expect(readSnooze('ke:x', NOW + 10 * DAY, store)).toBe(true)
    expect(readSnooze('ke:x', NOW + 30 * DAY, store)).toBe(false)
  })

  it('is a no-op without storage and never throws on a broken one', () => {
    expect(() => writeSnooze('ke:x', NOW, null)).not.toThrow()
    expect(readSnooze('ke:x', NOW, null)).toBe(false)
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => writeSnooze('ke:x', NOW, broken)).not.toThrow()
    expect(readSnooze('ke:x', NOW, broken)).toBe(false)
  })
})
