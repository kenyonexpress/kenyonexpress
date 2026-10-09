import { describe, expect, it } from 'vitest'
import { listFeatureFlags } from './feature-flags'

describe('listFeatureFlags', () => {
  it('reports every switch off when the env is empty', () => {
    const flags = listFeatureFlags({} as NodeJS.ProcessEnv)
    expect(flags).toHaveLength(4)
    expect(flags.every((flag) => flag.on === false)).toBe(true)
    expect(flags.map((flag) => flag.envName)).toEqual([
      'KILL_SWITCH_CACHE',
      'KILL_SWITCH_SEARCH',
      'KILL_SWITCH_RECS',
      'KILL_SWITCH_NOTIFICATIONS',
    ])
  })

  it('treats only a plain on-value as on', () => {
    const flags = listFeatureFlags({
      KILL_SWITCH_CACHE: '1',
      KILL_SWITCH_SEARCH: 'false',
      KILL_SWITCH_RECS: 'yes',
    } as unknown as NodeJS.ProcessEnv)
    const byName = Object.fromEntries(flags.map((flag) => [flag.subsystem, flag.on]))
    expect(byName.cache).toBe(true)
    expect(byName.search).toBe(false)
    expect(byName.recs).toBe(true)
    expect(byName.notifications).toBe(false)
  })
})
