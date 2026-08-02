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
