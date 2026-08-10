import { describe, expect, it } from 'vitest'
import { type ProfileRow, decidePhoneMerge } from './phone-merge'

const E164 = '+972501234567'

function profile(id: string, phone = '0501234567', email = 'a@b.test'): ProfileRow {
  return { id, phone, email }
}

const base = {
  e164: E164,
  candidates: [] as readonly ProfileRow[],
  authUser: null,
  alreadyAttachedToSomeone: false,
}

describe('decidePhoneMerge', () => {
  it('attaches when exactly one profile carries the number and the account has no phone', () => {
    expect(
      decidePhoneMerge({
        ...base,
        candidates: [profile('u1')],
        authUser: { id: 'u1', phone: null },
      }),
    ).toEqual({ action: 'attach', userId: 'u1', reason: 'profile phone matches one account' })
  })

  it('attaches when the account already holds the same number', () => {
    // Idempotent: a second sign-in must not be refused because the first one
    // already did the work.
    expect(
      decidePhoneMerge({
        ...base,
        candidates: [profile('u1')],
        authUser: { id: 'u1', phone: E164 },
      }).action,
    ).toBe('attach')
  })

  it('does nothing when the number is already attached to an account', () => {
    // Supabase routes the OTP itself in this case. Touching anything would be
    // a change with no purpose and a way to get it wrong.
    expect(
      decidePhoneMerge({
        ...base,
        candidates: [profile('u1')],
        authUser: { id: 'u1', phone: E164 },
        alreadyAttachedToSomeone: true,
      }).action,
    ).toBe('none')
  })

  it('refuses when two profiles carry the number', () => {
    // A shared family number, or a typo. The number no longer identifies a
    // person, and picking one would hand somebody else's order history to
    // whoever is holding the SIM.
    const decision = decidePhoneMerge({
      ...base,
      candidates: [profile('u1'), profile('u2')],
      authUser: { id: 'u1', phone: null },
    })
    expect(decision.action).toBe('none')
    expect(decision.reason).toContain('more than one')
  })

  it('refuses to overwrite a phone the account already verified', () => {
    // That number was attached from the account page after an SMS. An
    // unverified string typed into a signup form years ago must not replace it,
    // or knowing an old profile number becomes a way in.
    const decision = decidePhoneMerge({
      ...base,
      candidates: [profile('u1')],
      authUser: { id: 'u1', phone: '+972541111111' },
    })
    expect(decision.action).toBe('none')
    expect(decision.reason).toContain('different verified phone')
  })

  it('refuses when the auth row does not match the profile it was read for', () => {
    expect(
      decidePhoneMerge({
        ...base,
        candidates: [profile('u1')],
        authUser: { id: 'someone-else', phone: null },
      }).action,
    ).toBe('none')
  })

  it('does nothing for a number nobody has ever recorded', () => {
    const decision = decidePhoneMerge({ ...base, candidates: [] })
    expect(decision.action).toBe('none')
    expect(decision.reason).toContain('no existing profile')
  })
})
