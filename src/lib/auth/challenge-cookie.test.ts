import { describe, expect, it } from 'vitest'
import { openChallenge, sealChallenge } from './challenge-cookie'

const env = { SUPABASE_SECRET_KEY: 'sb_secret_test_key_long_enough' } as unknown as NodeJS.ProcessEnv
const now = 1_760_000_000_000

describe('challenge cookie', () => {
  it('round-trips a challenge for its purpose', () => {
    const sealed = sealChallenge({ c: 'abc', p: 'register', u: 'user-1' }, now, env)
    expect(openChallenge(sealed ?? undefined, 'register', now, env)).toMatchObject({
      c: 'abc',
      p: 'register',
      u: 'user-1',
    })
  })

  it('refuses the wrong purpose, a tampered body and an expired one', () => {
    const sealed = sealChallenge({ c: 'abc', p: 'register', u: 'user-1' }, now, env) as string
    expect(openChallenge(sealed, 'authenticate', now, env)).toBeNull()
    const [, mac] = sealed.split('.')
    const forged = `${Buffer.from(JSON.stringify({ c: 'x', p: 'register', u: 'evil', e: 9e9 })).toString('base64url')}.${mac}`
    expect(openChallenge(forged, 'register', now, env)).toBeNull()
    expect(openChallenge(sealed, 'register', now + 301_000, env)).toBeNull()
  })

  it('is disabled without a key', () => {
    expect(
      sealChallenge({ c: 'abc', p: 'register', u: null }, now, {} as NodeJS.ProcessEnv),
    ).toBeNull()
  })
})
