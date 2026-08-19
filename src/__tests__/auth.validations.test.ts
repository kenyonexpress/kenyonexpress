import {
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
