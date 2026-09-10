import {
  ViewAsSecretMissingError,
  mintViewAsGrant,
  verifyViewAsGrant,
  viewAsSigningKey,
} from '@/lib/admin/view-as-token'
import { mintOrderTrackingToken } from '@/lib/orders/tracking-token'
import { describe, expect, it } from 'vitest'

const ENV = {
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_long_enough_1234',
} as unknown as NodeJS.ProcessEnv
const TARGET = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const ACTOR = '11111111-2222-3333-4444-555555555555'

describe('viewAsSigningKey', () => {
  it('derives from the secret the server already needs, with no new env var', () => {
    expect(viewAsSigningKey(ENV)).toHaveLength(32)
  })

  it('accepts the service-role spelling as a fallback', () => {
    const key = viewAsSigningKey({
      SUPABASE_SERVICE_ROLE_KEY: ENV.SUPABASE_SECRET_KEY,
    } as unknown as NodeJS.ProcessEnv)
    expect(key).toHaveLength(32)
  })

  it('refuses a short stub rather than signing with it', () => {
    // `SUPABASE_SECRET_KEY=1234` is a real thing that appears in this repo's
    // env files, and a grant signed with it would be forgeable by anyone who
    // guessed the stub.
    expect(() =>
      viewAsSigningKey({ SUPABASE_SECRET_KEY: '1234' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(ViewAsSecretMissingError)
    expect(() => viewAsSigningKey({} as unknown as NodeJS.ProcessEnv)).toThrow(
      ViewAsSecretMissingError,
    )
  })

  it('is a different key from the order tracking link s', () => {
    // Same base secret, different derivation label. If these ever collided, a
    // tracking link would be usable as an impersonation grant.
    const tracking = mintOrderTrackingToken(TARGET, { env: ENV })
    expect(verifyViewAsGrant(tracking, TARGET, ACTOR, { env: ENV })).toMatchObject({
      ok: false,
    })
  })
})

describe('verifyViewAsGrant', () => {
  it('round trips a freshly minted grant', () => {
    const grant = mintViewAsGrant(TARGET, ACTOR, { env: ENV })
    const verdict = verifyViewAsGrant(grant, TARGET, ACTOR, { env: ENV })

    expect(verdict).toMatchObject({ ok: true, targetUserId: TARGET, actorId: ACTOR })
  })

  it('reports an absent cookie as absent, not as malformed', () => {
    // The page prints a different sentence for each, and "open it from the
    // customer page" is only correct for the absent case.
    expect(verifyViewAsGrant(null, TARGET, ACTOR, { env: ENV })).toEqual({
      ok: false,
      reason: 'absent',
    })
    expect(verifyViewAsGrant('   ', TARGET, ACTOR, { env: ENV })).toEqual({
      ok: false,
      reason: 'absent',
    })
  })

  it('refuses a grant minted for a different customer', () => {
    // The whole point: one audit row must not open two customers' histories.
    const grant = mintViewAsGrant(TARGET, ACTOR, { env: ENV })
    const other = '99999999-4f89-11d3-9a0c-0305e82c3301'
    expect(verifyViewAsGrant(grant, other, ACTOR, { env: ENV })).toEqual({
      ok: false,
      reason: 'wrong_target',
    })
  })

  it('refuses a grant handed to a different operator', () => {
    // A cookie is a bearer credential. Without the actor bind, an operator
    // could pass the string along and the audit row would name the wrong person.
    const grant = mintViewAsGrant(TARGET, ACTOR, { env: ENV })
    const someoneElse = '00000000-0000-0000-0000-000000000000'
    expect(verifyViewAsGrant(grant, TARGET, someoneElse, { env: ENV })).toEqual({
      ok: false,
      reason: 'wrong_actor',
    })
  })

  it('expires, and reports expiry distinctly from a bad signature', () => {
    const now = new Date('2026-09-10T10:00:00Z')
    const grant = mintViewAsGrant(TARGET, ACTOR, { env: ENV, now, ttlSeconds: 60 })

    expect(
      verifyViewAsGrant(grant, TARGET, ACTOR, {
        env: ENV,
        now: new Date('2026-09-10T10:00:59Z'),
      }),
    ).toMatchObject({ ok: true })

    expect(
      verifyViewAsGrant(grant, TARGET, ACTOR, {
        env: ENV,
        now: new Date('2026-09-10T10:01:01Z'),
      }),
    ).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses a payload edited to name another customer', () => {
    const grant = mintViewAsGrant(TARGET, ACTOR, { env: ENV })
    const [version, body, mac] = grant.split('.')
    const payload = JSON.parse(Buffer.from(body ?? '', 'base64url').toString('utf8'))
    payload.t = '99999999-4f89-11d3-9a0c-0305e82c3301'
    const forged = `${version}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${mac}`

    expect(verifyViewAsGrant(forged, payload.t, ACTOR, { env: ENV })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('refuses a grant signed with a different secret', () => {
    const grant = mintViewAsGrant(TARGET, ACTOR, {
      env: {
        SUPABASE_SECRET_KEY: 'sb_secret_a_completely_other_key_99',
      } as unknown as NodeJS.ProcessEnv,
    })
    expect(verifyViewAsGrant(grant, TARGET, ACTOR, { env: ENV })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('rejects junk on shape before it costs an HMAC', () => {
    expect(verifyViewAsGrant('x'.repeat(2000), TARGET, ACTOR, { env: ENV })).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyViewAsGrant('KEV1.only-two-parts', TARGET, ACTOR, { env: ENV })).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(
      verifyViewAsGrant('NOPE.aaaaaaaaaaaa.bbbbbbbbbbbb', TARGET, ACTOR, { env: ENV }),
    ).toEqual({ ok: false, reason: 'malformed' })
  })

  it('treats a missing secret as unverifiable rather than throwing', () => {
    const grant = mintViewAsGrant(TARGET, ACTOR, { env: ENV })
    expect(
      verifyViewAsGrant(grant, TARGET, ACTOR, { env: {} as unknown as NodeJS.ProcessEnv }),
    ).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })
})
