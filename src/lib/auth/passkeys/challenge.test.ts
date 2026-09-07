import { describe, expect, it } from 'vitest'
import {
  type ChallengePayload,
  PASSKEY_CHALLENGE_TTL_MS,
  newChallenge,
  openChallenge,
  sealChallenge,
} from './challenge'

const SECRET = 'test-secret-key-of-reasonable-length'

function payload(overrides: Partial<ChallengePayload> = {}): ChallengePayload {
  return {
    challenge: newChallenge(),
    type: 'authentication',
    userId: null,
    expiresAt: Date.now() + PASSKEY_CHALLENGE_TTL_MS,
    ...overrides,
  }
}

describe('newChallenge', () => {
  it('returns base64url and never repeats', () => {
    const a = newChallenge()
    const b = newChallenge()
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    // 32 bytes -> 43 base64url chars, the size the spec recommends.
    expect(a).toHaveLength(43)
    expect(a).not.toBe(b)
  })
})

describe('sealChallenge / openChallenge', () => {
  it('round-trips a payload intact', () => {
    const original = payload({ type: 'registration', userId: 'user-1' })
    const opened = openChallenge(sealChallenge(original, SECRET), SECRET)
    expect(opened).toEqual(original)
  })

  it('rejects a payload sealed with a different secret', () => {
    const sealed = sealChallenge(payload(), 'some-other-secret')
    expect(openChallenge(sealed, SECRET)).toBeNull()
  })

  it('rejects a tampered body even when the structure stays valid', () => {
    const original = payload({ userId: 'victim' })
    const sealed = sealChallenge(original, SECRET)
    const mac = sealed.slice(sealed.indexOf('.') + 1)
    // An attacker rewriting the bound user, keeping the original signature.
    const forgedBody = Buffer.from(JSON.stringify({ ...original, userId: 'attacker' })).toString(
      'base64url',
    )
    expect(openChallenge(`${forgedBody}.${mac}`, SECRET)).toBeNull()
  })

  it('rejects an expired payload', () => {
    const sealed = sealChallenge(payload({ expiresAt: Date.now() - 1 }), SECRET)
    expect(openChallenge(sealed, SECRET)).toBeNull()
  })

  it('treats expiry as exclusive: expiresAt equal to now is expired', () => {
    const now = 1_700_000_000_000
    const sealed = sealChallenge(payload({ expiresAt: now }), SECRET)
    expect(openChallenge(sealed, SECRET, now)).toBeNull()
    expect(openChallenge(sealed, SECRET, now - 1)).not.toBeNull()
  })

  it.each([
    ['empty string', ''],
    ['no separator', 'justonepart'],
    ['leading separator', '.mac-with-no-body'],
    ['garbage mac', `${Buffer.from('{}').toString('base64url')}.zzz`],
    ['not json', `plainbody.${Buffer.from('sig').toString('base64url')}`],
  ])('returns null for %s instead of throwing', (_name, sealed) => {
    expect(openChallenge(sealed, SECRET)).toBeNull()
  })

  it.each([
    ['empty challenge', { challenge: '' }],
    ['unknown type', { type: 'attestation' }],
    ['numeric userId', { userId: 7 }],
    ['string expiry', { expiresAt: 'soon' }],
  ])('rejects a validly signed payload with %s', (_name, defect) => {
    // Sealed with the real secret, so the HMAC passes and only the shape
    // guard stands between JSON.parse and the callers' property reads.
    const sealed = sealChallenge({ ...payload(), ...defect } as ChallengePayload, SECRET)
    expect(openChallenge(sealed, SECRET)).toBeNull()
  })
})
