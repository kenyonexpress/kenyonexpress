import { describe, expect, it } from 'vitest'
import {
  isSmsCapableIsraeli,
  maskPhone,
  phoneAuthEnabled,
  phoneAuthErrorHebrew,
  toE164Israeli,
} from './phone-otp'

const env = (value: Record<string, string>) => value as unknown as NodeJS.ProcessEnv

describe('phoneAuthEnabled', () => {
  it('is off unless explicitly on', () => {
    expect(phoneAuthEnabled(env({}))).toBe(false)
    expect(phoneAuthEnabled(env({ PHONE_AUTH_ENABLED: 'false' }))).toBe(false)
    expect(phoneAuthEnabled(env({ PHONE_AUTH_ENABLED: 'true' }))).toBe(true)
    expect(phoneAuthEnabled(env({ PHONE_AUTH_ENABLED: '1' }))).toBe(true)
  })

  it('is not read from a public variable, because there is no client copy', () => {
    // There used to be a `phoneAuthEnabledPublic` and nothing called it: the
    // login page is a server component and passes the answer down as a prop,
    // so there is no second value that could disagree with this one. An
    // operator who set only `NEXT_PUBLIC_PHONE_AUTH_ENABLED` -- which
    // ENV-REFERENCE listed -- got a login page with no phone tab and no reason
    // given.
    expect(phoneAuthEnabled(env({ NEXT_PUBLIC_PHONE_AUTH_ENABLED: 'true' }))).toBe(false)
  })
})

describe('toE164Israeli', () => {
  it('accepts every form a customer actually types', () => {
    expect(toE164Israeli('050-123-4567')).toBe('+972501234567')
    expect(toE164Israeli('0501234567')).toBe('+972501234567')
    expect(toE164Israeli('+972 50 1234567')).toBe('+972501234567')
    expect(toE164Israeli('972501234567')).toBe('+972501234567')
  })

  it('returns null rather than a malformed number', () => {
    expect(toE164Israeli('')).toBeNull()
    expect(toE164Israeli(null)).toBeNull()
    expect(toE164Israeli('12345')).toBeNull()
    expect(toE164Israeli('לא מספר')).toBeNull()
  })
})

describe('isSmsCapableIsraeli', () => {
  it('accepts mobiles', () => {
    expect(isSmsCapableIsraeli('0501234567')).toBe(true)
    expect(isSmsCapableIsraeli('054-999-8888')).toBe(true)
  })

  it('refuses a landline before an SMS is spent on it', () => {
    // A landline passes the format check and is accepted by the provider; the
    // message is simply never delivered, and the customer watches a code screen
    // that will never fill. Refusing here is the honest failure.
    expect(isSmsCapableIsraeli('03-6123456')).toBe(false)
    expect(isSmsCapableIsraeli('02-1234567')).toBe(false)
    expect(isSmsCapableIsraeli('077-1234567')).toBe(false)
  })

  it('refuses anything that is not a number at all', () => {
    expect(isSmsCapableIsraeli(null)).toBe(false)
    expect(isSmsCapableIsraeli('+1 415 555 1234')).toBe(false)
  })
})

describe('maskPhone', () => {
  it('shows enough to catch a typo and no more', () => {
    expect(maskPhone('+972501234567')).toBe('+9725*****567')
  })

  it('leaves a short string alone rather than producing nonsense', () => {
    expect(maskPhone('+972')).toBe('+972')
  })
})

describe('phoneAuthErrorHebrew', () => {
  it('translates the failures a customer can act on', () => {
    expect(phoneAuthErrorHebrew('Token has expired or is invalid')).toBe('הקוד שגוי או שפג תוקפו')
    expect(phoneAuthErrorHebrew('Invalid phone number format')).toBe('מספר הטלפון אינו תקין')
  })

  it('hides provider detail behind one generic line', () => {
    // An SMS gateway error names the provider, the account and often the
    // reason a number was rejected. None of that belongs on a login screen.
    expect(phoneAuthErrorHebrew('Twilio: account SIDxxxx is suspended')).toBe(
      'אירעה שגיאה, נסו שוב',
    )
  })

  it('recognises the rate limit under either spelling', () => {
    expect(phoneAuthErrorHebrew('over_sms_send_rate_limit')).toBe(
      'יותר מדי בקשות, המתינו דקה ונסו שוב',
    )
    expect(phoneAuthErrorHebrew('Too many requests')).toBe('יותר מדי ניסיונות, נסו שוב מאוחר יותר')
  })
})
