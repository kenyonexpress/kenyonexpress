import {
  changePasswordSchema,
  emailOtpVerifySchema,
  loginSchema,
  magicLinkSchema,
  newPasswordSchema,
  passwordResetSchema,
  signupSchema,
} from '@/lib/validations/auth'
import { describe, expect, it } from 'vitest'

describe('loginSchema', () => {
  it('accepts valid email and password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: 'secret' })
    expect(result.success).toBe(true)
  })

  it('rejects missing email', () => {
    const result = loginSchema.safeParse({ email: '', password: 'secret' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'secret' })
    expect(result.success).toBe(false)
  })

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '' })
    expect(result.success).toBe(false)
  })
})

describe('signupSchema', () => {
  const valid = {
    full_name: 'ישראל ישראלי',
    email: 'user@example.com',
    phone: '0501234567',
    password: 'Secret1234',
  }

  it('accepts valid Israeli mobile (05x)', () => {
    const result = signupSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('accepts phone with dashes', () => {
    const result = signupSchema.safeParse({ ...valid, phone: '050-123-4567' })
    expect(result.success).toBe(true)
  })

  it('accepts international format +972', () => {
    const result = signupSchema.safeParse({ ...valid, phone: '+972501234567' })
    expect(result.success).toBe(true)
  })

  // The country code without its plus, which is how a number pasted out of a
  // contacts export or a WhatsApp link usually arrives. Named in the QA
  // checklist alongside the other three, and the only one of the four that had
  // no case here.
  it('accepts 972 with no leading plus', () => {
    const result = signupSchema.safeParse({ ...valid, phone: '972521234567' })
    expect(result.success).toBe(true)
  })

  it('accepts 07x VoIP numbers', () => {
    const result = signupSchema.safeParse({ ...valid, phone: '0721234567' })
    expect(result.success).toBe(true)
  })

  it('rejects landline numbers', () => {
    const result = signupSchema.safeParse({ ...valid, phone: '0391234567' })
    expect(result.success).toBe(false)
  })

  it('rejects too-short phone', () => {
    const result = signupSchema.safeParse({ ...valid, phone: '050123' })
    expect(result.success).toBe(false)
  })

  it('rejects password without digit', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'onlyletters' })
    expect(result.success).toBe(false)
  })

  it('rejects password shorter than 8 chars', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'Ab1' })
    expect(result.success).toBe(false)
  })

  it('rejects name shorter than 2 chars', () => {
    const result = signupSchema.safeParse({ ...valid, full_name: 'א' })
    expect(result.success).toBe(false)
  })

  /*
    THE TWO CHARACTERS ARE COUNTED AFTER TRIMMING, WHICH THEY WERE NOT.

    The chain used to read `.min(2).trim()`, so the length was measured on the
    raw string and only the survivor was trimmed. Two spaces are two characters:
    `"  "` passed the rule and was stored as `""`, `" a "` passed and was stored
    as `"a"`. The case above did not catch it because a bare `'א'` is short
    either way - the padding is what makes the order visible.

    Reachable as typed: full_name is `type="text"` and the browser submits the
    spaces verbatim (measured on /signup: the serialised value was `"  "`).
  */
  it('rejects whitespace that is only long enough before trimming', () => {
    for (const full_name of ['  ', '   ', ' a ', '\t\t']) {
      const result = signupSchema.safeParse({ ...valid, full_name })
      expect(result.success, `${JSON.stringify(full_name)} should be refused`).toBe(false)
    }
  })

  it('keeps the trimmed name when it is long enough', () => {
    const result = signupSchema.safeParse({ ...valid, full_name: '  ישראל ישראלי  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.full_name).toBe('ישראל ישראלי')
  })

  it('normalises email to lowercase', () => {
    const result = signupSchema.safeParse({ ...valid, email: 'User@EXAMPLE.COM' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe('user@example.com')
  })
})

describe('magicLinkSchema', () => {
  it('accepts valid email', () => {
    expect(magicLinkSchema.safeParse({ email: 'a@b.co' }).success).toBe(true)
  })

  it('rejects invalid email', () => {
    expect(magicLinkSchema.safeParse({ email: 'bad' }).success).toBe(false)
  })
})

describe('passwordResetSchema', () => {
  it('accepts valid email', () => {
    expect(passwordResetSchema.safeParse({ email: 'reset@me.com' }).success).toBe(true)
  })
})

describe('newPasswordSchema', () => {
  it('accepts matching passwords with digit', () => {
    const result = newPasswordSchema.safeParse({
      password: 'NewPass1',
      confirm_password: 'NewPass1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects mismatched passwords', () => {
    const result = newPasswordSchema.safeParse({
      password: 'NewPass1',
      confirm_password: 'Different1',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('confirm_password')
    }
  })

  it('rejects password without digit', () => {
    const result = newPasswordSchema.safeParse({
      password: 'NoDigitHere',
      confirm_password: 'NoDigitHere',
    })
    expect(result.success).toBe(false)
  })
})

describe('emailOtpVerifySchema', () => {
  it('accepts a six-digit code and lower-cases the address it rides with', () => {
    const result = emailOtpVerifySchema.safeParse({ email: 'User@Example.com', token: ' 123456 ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('user@example.com')
      expect(result.data.token).toBe('123456')
    }
  })

  it('rejects a code with anything but digits', () => {
    for (const token of ['12345a', '123-456', '', '12 34 56']) {
      expect(emailOtpVerifySchema.safeParse({ email: 'u@example.com', token }).success).toBe(false)
    }
  })

  it('rejects a missing or malformed address', () => {
    expect(emailOtpVerifySchema.safeParse({ email: '', token: '123456' }).success).toBe(false)
    expect(emailOtpVerifySchema.safeParse({ email: 'nope', token: '123456' }).success).toBe(false)
  })
})

describe('changePasswordSchema', () => {
  const valid = {
    current_password: 'OldSecret1',
    password: 'NewSecret2',
    confirm_password: 'NewSecret2',
  }

  it('accepts a matching pair with a digit and eight characters', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true)
  })

  it('holds the new password to the signup rule', () => {
    expect(
      changePasswordSchema.safeParse({ ...valid, password: 'short1', confirm_password: 'short1' })
        .success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        ...valid,
        password: 'nodigitsss',
        confirm_password: 'nodigitsss',
      }).success,
    ).toBe(false)
  })

  it('rejects a confirmation that differs', () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirm_password: 'NewSecret3' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['confirm_password'])
  })

  it('rejects a new password identical to the current one', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'SameSecret1',
      password: 'SameSecret1',
      confirm_password: 'SameSecret1',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['password'])
  })

  it('requires the current password', () => {
    expect(changePasswordSchema.safeParse({ ...valid, current_password: '' }).success).toBe(false)
  })
})
