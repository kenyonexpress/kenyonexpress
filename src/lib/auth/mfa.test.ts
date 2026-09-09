import { describe, expect, it } from 'vitest'
import { decideMfaGate } from './mfa'

describe('decideMfaGate', () => {
  it('stops exactly the enrolled-but-unproven session', () => {
    expect(decideMfaGate({ currentLevel: 'aal1', nextLevel: 'aal2' })).toEqual({
      pass: false,
      reason: 'challenge_required',
    })
  })

  it('passes a proven aal2 session', () => {
    expect(decideMfaGate({ currentLevel: 'aal2', nextLevel: 'aal2' }).pass).toBe(true)
  })

  it('passes an unenrolled session -- enrollment is user-driven', () => {
    expect(decideMfaGate({ currentLevel: 'aal1', nextLevel: 'aal1' }).pass).toBe(true)
    expect(decideMfaGate({ currentLevel: null, nextLevel: null }).pass).toBe(true)
  })
})
