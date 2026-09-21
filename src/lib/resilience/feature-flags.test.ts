import { describe, expect, it } from 'vitest'
import { FEATURE_FLAG_KEYS, flagFromEnv, isFeatureFlagKey, resolveFlag } from './feature-flags'

describe('resolveFlag', () => {
  it('lets the environment win, then the table, then the documented default', () => {
    expect(resolveFlag('CHECKOUT_ENABLED', 'false', true)).toEqual({
      enabled: false,
      source: 'env',
    })
    expect(resolveFlag('CHECKOUT_ENABLED', undefined, false)).toEqual({
      enabled: false,
      source: 'table',
    })
    expect(resolveFlag('CHECKOUT_ENABLED', undefined, null)).toEqual({
      enabled: true,
      source: 'default',
    })
    expect(resolveFlag('AI_CS_AGENT_ENABLED', undefined, undefined)).toEqual({
      enabled: false,
      source: 'default',
    })
  })

  it('ignores an environment value that says nothing plainly', () => {
    expect(flagFromEnv('maybe')).toBeNull()
    expect(flagFromEnv('')).toBeNull()
    expect(resolveFlag('SEARCH_ENABLED', 'maybe', false)).toEqual({
      enabled: false,
      source: 'table',
    })
  })

  it('names exactly the documented flags, and nothing that must never be true', () => {
    expect(FEATURE_FLAG_KEYS).not.toContain('ESCROW_FLOW_ENABLED')
    expect(FEATURE_FLAG_KEYS).not.toContain('MAINTENANCE_MODE')
    expect(isFeatureFlagKey('CHECKOUT_ENABLED')).toBe(true)
    expect(isFeatureFlagKey('KILL_SWITCH_CACHE')).toBe(false)
  })
})
