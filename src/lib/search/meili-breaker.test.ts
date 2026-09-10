import { describe, expect, it } from 'vitest'
import {
  COOLDOWN_MS,
  FAILURE_THRESHOLD,
  closed,
  isOpen,
  recordFailure,
  recordSuccess,
} from './meili-breaker'

const NOW = 1_800_000_000_000

describe('the Meilisearch breaker', () => {
  it('starts closed', () => {
    expect(isOpen(closed, NOW)).toBe(false)
  })

  it('stays closed below the threshold, so one blip does not degrade relevance', () => {
    let state = closed
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) state = recordFailure(state, NOW)
    expect(isOpen(state, NOW)).toBe(false)
    expect(state.failures).toBe(FAILURE_THRESHOLD - 1)
  })

  it('opens on the third consecutive failure and closes again after the cooldown', () => {
    let state = closed
    for (let i = 0; i < FAILURE_THRESHOLD; i++) state = recordFailure(state, NOW)
    expect(isOpen(state, NOW)).toBe(true)
    expect(isOpen(state, NOW + COOLDOWN_MS - 1)).toBe(true)
    expect(isOpen(state, NOW + COOLDOWN_MS)).toBe(false)
  })

  it('re-arms on a failure past the threshold, not only on the third', () => {
    // The case this exists for: the probe that runs after a cooldown fails too.
    // A breaker that only armed at exactly three would then be closed, and the
    // timeout would be back in front of every search.
    let state = closed
    for (let i = 0; i < FAILURE_THRESHOLD; i++) state = recordFailure(state, NOW)
    const afterCooldown = NOW + COOLDOWN_MS
    expect(isOpen(state, afterCooldown)).toBe(false)

    state = recordFailure(state, afterCooldown)
    expect(isOpen(state, afterCooldown)).toBe(true)
    expect(state.failures).toBe(FAILURE_THRESHOLD + 1)
  })

  it('forgets the failures on any success', () => {
    let state = closed
    state = recordFailure(state, NOW)
    state = recordFailure(state, NOW)
    state = recordSuccess(state)
    expect(state).toEqual(closed)

    // And the counter really is back to zero: two more failures must not open it.
    state = recordFailure(state, NOW)
    state = recordFailure(state, NOW)
    expect(isOpen(state, NOW)).toBe(false)
  })
})
