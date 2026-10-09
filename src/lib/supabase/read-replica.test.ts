import { describe, expect, it } from 'vitest'
import { catalogueReadTarget, isReadReplicaConfigured, readReplicaUrl } from './read-replica'

const PRIMARY = 'https://abcd1234.supabase.co'
const REPLICA = 'https://abcd1234-all.supabase.co'

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { NEXT_PUBLIC_SUPABASE_URL: PRIMARY, ...overrides } as unknown as NodeJS.ProcessEnv
}

describe('readReplicaUrl', () => {
  it('is null when the variable is unset, so nothing changes until it is provisioned', () => {
    expect(readReplicaUrl(env({}))).toBeNull()
    expect(readReplicaUrl(env({ SUPABASE_READ_REPLICA_URL: '' }))).toBeNull()
    expect(readReplicaUrl(env({ SUPABASE_READ_REPLICA_URL: '   ' }))).toBeNull()
    expect(isReadReplicaConfigured(env({}))).toBe(false)
  })

  it('returns the replica endpoint without a trailing slash', () => {
    expect(readReplicaUrl(env({ SUPABASE_READ_REPLICA_URL: `${REPLICA}/` }))).toBe(REPLICA)
    expect(isReadReplicaConfigured(env({ SUPABASE_READ_REPLICA_URL: REPLICA }))).toBe(true)
  })

  it('treats a replica variable pointing at the primary as unconfigured', () => {
    expect(readReplicaUrl(env({ SUPABASE_READ_REPLICA_URL: PRIMARY }))).toBeNull()
    expect(readReplicaUrl(env({ SUPABASE_READ_REPLICA_URL: `${PRIMARY}/` }))).toBeNull()
  })

  it('refuses a non-https endpoint rather than sending the anon key over http', () => {
    expect(readReplicaUrl(env({ SUPABASE_READ_REPLICA_URL: 'http://replica.internal' }))).toBeNull()
  })
})

describe('catalogueReadTarget', () => {
  it('falls back to the primary and says so', () => {
    expect(catalogueReadTarget(env({}))).toEqual({ url: PRIMARY, replica: false })
  })

  it('prefers the replica when configured', () => {
    expect(catalogueReadTarget(env({ SUPABASE_READ_REPLICA_URL: REPLICA }))).toEqual({
      url: REPLICA,
      replica: true,
    })
  })

  it('throws when neither URL exists, the same as every other client factory', () => {
    expect(() => catalogueReadTarget({} as unknown as NodeJS.ProcessEnv)).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    )
  })
})
