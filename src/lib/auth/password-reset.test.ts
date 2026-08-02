import { describe, expect, it } from 'vitest'
import { PASSWORD_RESET_MESSAGE, passwordResetResult } from './password-reset'

describe('passwordResetResult', () => {
  // The vulnerability: returning the provider error let an attacker tell a
  // registered address from an unregistered one.
  it('returns an identical response for every provider outcome', () => {
    const outcomes = [
      null,
      undefined,
      { message: 'User not found' },
      { message: 'Email rate limit exceeded' },
      { message: 'unexpected provider failure' },
    ]

    const responses = outcomes.map((o) => passwordResetResult(o))
    const [first] = responses

    for (const response of responses) {
      expect(response).toEqual(first)
    }
  })

  it('never exposes an error field to the client', () => {
    const response = passwordResetResult({ message: 'User not found' })
    expect(response).not.toHaveProperty('error')
    expect(response.success).toBe(PASSWORD_RESET_MESSAGE)
  })

  it('reports success even when the address does not exist', () => {
    expect(passwordResetResult(null).success).toBe(PASSWORD_RESET_MESSAGE)
    expect(passwordResetResult({ message: 'User not found' }).success).toBe(PASSWORD_RESET_MESSAGE)
  })
})
