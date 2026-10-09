import { isThreeDSChallengeRequired, threeDSecureLowProfileFields } from '@/lib/payments/threeds'
import { describe, expect, it } from 'vitest'

/** A bare env for the unit under test; ProcessEnv demands NODE_ENV, tests do not. */
function stubEnv(vars: Record<string, string> = {}): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv
}

describe('threeDSecureLowProfileFields', () => {
  it('sends nothing when the variable is unset, so the terminal keeps deciding', () => {
    expect(threeDSecureLowProfileFields(stubEnv())).toEqual({})
  })

  it('sends nothing when the variable is blank, which is how a cleared dashboard value reads', () => {
    expect(threeDSecureLowProfileFields(stubEnv({ CARDCOM_3DS_STATE: '  ' }))).toEqual({})
  })

  it.each([
    ['auto', 'Auto'],
    ['enabled', 'Enable'],
    ['disabled', 'Disable'],
    ['AUTO', 'Auto'],
  ])('maps %s to ThreeDSecureState=%s', (configured, wire) => {
    expect(threeDSecureLowProfileFields(stubEnv({ CARDCOM_3DS_STATE: configured }))).toEqual({
      ThreeDSecureState: wire,
    })
  })

  it('refuses to guess for a value it does not know rather than sending a typo to the terminal', () => {
    expect(threeDSecureLowProfileFields(stubEnv({ CARDCOM_3DS_STATE: 'enable' }))).toEqual({})
  })
})

describe('isThreeDSChallengeRequired', () => {
  it('recognizes a code from the configured list, exactly', () => {
    expect(
      isThreeDSChallengeRequired(
        { failureCode: '9993', failureMessage: null },
        stubEnv({ CARDCOM_3DS_REQUIRED_CODES: '9993, 552' }),
      ),
    ).toBe(true)
    expect(
      isThreeDSChallengeRequired(
        { failureCode: '999', failureMessage: null },
        stubEnv({ CARDCOM_3DS_REQUIRED_CODES: '9993' }),
      ),
    ).toBe(false)
  })

  it('recognizes 3DS language in the description', () => {
    expect(
      isThreeDSChallengeRequired(
        { failureCode: '550', failureMessage: 'ThreeDSecure challenge required' },
        stubEnv(),
      ),
    ).toBe(true)
    expect(
      isThreeDSChallengeRequired(
        { failureCode: '550', failureMessage: '3-D Secure authentication required' },
        stubEnv(),
      ),
    ).toBe(true)
  })

  it('treats an ordinary decline as a decline', () => {
    expect(
      isThreeDSChallengeRequired(
        { failureCode: '33', failureMessage: 'insufficient funds' },
        stubEnv(),
      ),
    ).toBe(false)
    expect(isThreeDSChallengeRequired({ failureCode: null, failureMessage: null }, stubEnv())).toBe(
      false,
    )
  })

  it('is not tripped by a bare digit 3 in a numeric code', () => {
    expect(
      isThreeDSChallengeRequired({ failureCode: '3', failureMessage: 'סירוב' }, stubEnv()),
    ).toBe(false)
  })
})
