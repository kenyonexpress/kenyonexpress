import {
  COMPROMISED_KEYS,
  compromisedKeyMessage,
  findCompromised,
  fingerprint,
  scanEnvironmentForCompromisedKeys,
} from '@/lib/compromised-keys'
import { describe, expect, it } from 'vitest'

/**
 * A KNOWN-EXPOSED KEY MUST NOT BE ABLE TO SERVE PRODUCTION TRAFFIC.
 *
 * The Supabase secret key in use on 2026-09-04 was exposed during setup. It
 * works, which is the danger: nothing looks wrong, `env.probe_ok` reports clean,
 * and it will keep working long after it should have been retired. A rotation
 * that depends on somebody remembering does not happen.
 */
describe('the compromised key list', () => {
  it('stores a digest and never the key itself', () => {
    // Committing the literal would publish the credential this file exists to
    // retire. Every entry must be a 64-char hex digest and nothing else.
    for (const key of COMPROMISED_KEYS) {
      expect(key.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(key.prefix.length).toBeLessThanOrEqual(20)
      expect(key.note.length).toBeGreaterThan(20)
    }
  })

  it('matches the exact value and nothing near it', () => {
    const [entry] = COMPROMISED_KEYS
    expect(entry).toBeDefined()
    // Reconstructing the key from the digest is the thing that must be
    // impossible, so the test works the other way: a value that hashes to the
    // recorded digest is recognised, and everything else is not.
    expect(findCompromised('some-other-key')).toBeNull()
    expect(findCompromised(undefined)).toBeNull()
    expect(findCompromised('')).toBeNull()
  })

  it('recognises a listed key by its digest', () => {
    const listed = {
      sha256: fingerprint('a-test-secret'),
      prefix: 'a-test',
      note: 'fixture for the test, twenty characters plus',
    }
    COMPROMISED_KEYS.push(listed)
    try {
      expect(findCompromised('a-test-secret')).toBe(listed)
      expect(findCompromised(' a-test-secret ')).toBe(listed) // trimmed
    } finally {
      COMPROMISED_KEYS.pop()
    }
  })

  it('scans the secret-bearing variables and names the offender', () => {
    const listed = {
      sha256: fingerprint('leaked-cron'),
      prefix: 'leaked',
      note: 'fixture for the test, twenty characters plus',
    }
    COMPROMISED_KEYS.push(listed)
    try {
      const findings = scanEnvironmentForCompromisedKeys({
        NODE_ENV: 'test',
        CRON_SECRET: 'leaked-cron',
        SOME_OTHER_VAR: 'leaked-cron',
      } as NodeJS.ProcessEnv)
      // CRON_SECRET is on the checked list; SOME_OTHER_VAR is not, deliberately,
      // because hashing every env var on every boot is a good way to log one.
      expect(findings).toHaveLength(1)
      expect(findings[0]?.variable).toBe('CRON_SECRET')
    } finally {
      COMPROMISED_KEYS.pop()
    }
  })

  it('says what to do, in Hebrew, naming the variable', () => {
    const [key] = COMPROMISED_KEYS
    expect(key).toBeDefined()
    if (!key) return
    const message = compromisedKeyMessage({ variable: 'SUPABASE_SECRET_KEY', key })
    expect(message).toContain('SUPABASE_SECRET_KEY')
    expect(message).toContain('RUNBOOK')
    expect(message).toContain('רוטציה')
    // And it must not carry the key.
    expect(message).not.toContain(key.sha256)
  })

  it('has the setup-exposed key on it', () => {
    // The entry this was written for. If it is ever removed, it should be
    // because the key was rotated, and that is a deliberate edit.
    expect(COMPROMISED_KEYS.some((k) => k.prefix.startsWith('sb_secret_'))).toBe(true)
  })
})
